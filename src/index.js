const {
  Client,
  Events,
  GatewayIntentBits,
  Partials
} = require('discord.js');
const env = require('./env');
const { BotDatabase } = require('./db');
const commands = require('./commands');
const { buildEmbed, error, success, warning } = require('./embeds');
const { isBotOwner, isGuildModerator } = require('./permissions');
const ai = require('./services/ai');
const restrictions = require('./services/restrictions');
const tickets = require('./services/tickets');
const { advancedLog } = require('./services/logger');
const watchers = require('./services/watchers');
const { startDashboard } = require('./dashboard/server');

const db = new BotDatabase(env.databasePath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (env.enableSlashCommands && env.registerSlashOnReady) {
    try {
      const result = await commands.registerSlashCommands(client);
      console.log(result);
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  }

  watchers.startWatchers(client, db, restrictions);
  startDashboard({ client, db });
  for (const guild of client.guilds.cache.values()) {
    db.ensureGuildConfig(guild.id);
    watchers.updateMemberCountChannel(db, guild).catch(() => null);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  if (db.isBotBanned('guild', guild.id)) {
    await guild.leave().catch(() => null);
    return;
  }

  db.ensureGuildConfig(guild.id);

  if (env.enableSlashCommands && env.registerSlashOnReady) {
    await guild.commands.set(commands.slashCommands()).catch(() => null);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  await restrictions.reapplyRestrictionOnJoin(db, member).catch(() => null);
  await sendWelcome(member).catch(() => null);
  await watchers.updateMemberCountChannel(db, member.guild).catch(() => null);
  await advancedLog(db, member.guild, {
    title: 'Member Joined',
    fields: [
      { name: 'Member', value: `${member.user} (${member.id})`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
    ],
    style: 'emerald'
  }).catch(() => null);
});

client.on(Events.GuildMemberRemove, async (member) => {
  await watchers.updateMemberCountChannel(db, member.guild).catch(() => null);
  await advancedLog(db, member.guild, {
    title: 'Member Left',
    fields: [{ name: 'Member', value: `${member.user} (${member.id})`, inline: true }],
    style: 'amber'
  }).catch(() => null);
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  const attachment = message.attachments?.first()?.url || null;
  db.setSnipe(message.guild.id, message.channel.id, message.author?.id, message.content, attachment);
  await advancedLog(db, message.guild, {
    title: 'Message Deleted',
    fields: [
      { name: 'Author', value: message.author ? `${message.author} (${message.author.id})` : 'Unknown', inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Content', value: message.content || attachment || 'No content' }
    ],
    style: 'amber'
  }).catch(() => null);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await advancedLog(db, newMessage.guild, {
    title: 'Message Edited',
    fields: [
      { name: 'Author', value: `${newMessage.author} (${newMessage.author.id})`, inline: true },
      { name: 'Channel', value: `${newMessage.channel}`, inline: true },
      { name: 'Before', value: oldMessage.content || 'Unknown' },
      { name: 'After', value: newMessage.content || 'Unknown' }
    ],
    style: 'sapphire'
  }).catch(() => null);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const ownerBypass = isBotOwner(message.author.id);
  if ((db.isBotBanned('guild', message.guild.id) || db.isBotBanned('member', message.author.id)) && !ownerBypass) return;
  const runtimeFlags = db.runtimeFlags();
  if ((runtimeFlags.maintenance || runtimeFlags.panicMode) && !ownerBypass) return;

  try {
    await handleAfk(message);

    const moderation = runtimeFlags.aiLocked || runtimeFlags.botLocked
      ? { blocked: false }
      : ai.moderateText(message.content);
    if (moderation.blocked && !isGuildModerator(db, message.member)) {
      await message.delete().catch(() => null);
      await advancedLog(db, message.guild, {
        title: 'AI Moderation',
        fields: [
          { name: 'Member', value: `${message.author} (${message.author.id})`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Reason', value: moderation.reason },
          { name: 'Content', value: message.content.slice(0, 1000) || 'No content' }
        ],
        style: 'ruby'
      }).catch(() => null);
      return;
    }

    if (await handleRestrictChannelMessage(message)) return;
    if (await handleCountingMessage(message)) return;

    const handledPrefix = await commands.handlePrefixMessage(message, db, client);
    if (handledPrefix) return;

    await handleSticky(message);

    if (message.mentions.has(client.user)) {
      await handleAiMention(message);
    }
  } catch (err) {
    await message.reply({ embeds: [error(db, message.guild.id, err.message || 'Message handling failed.')] }).catch(() => null);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const runtimeFlags = db.runtimeFlags();
    const ownerBypass = isBotOwner(interaction.user?.id);
    if ((runtimeFlags.maintenance || runtimeFlags.panicMode) && !ownerBypass) {
      const payload = { embeds: [warning(db, interaction.guild?.id, 'The bot is in maintenance/panic mode. Try again later.')], ephemeral: true };
      if (interaction.isRepliable()) await interaction.reply(payload).catch(() => null);
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (!env.enableSlashCommands) {
        await interaction.reply({ embeds: [warning(db, interaction.guild?.id, 'Slash commands are disabled in .env.')], ephemeral: true });
        return;
      }
      if (interaction.guild && db.isBotBanned('guild', interaction.guild.id) && !ownerBypass) return;
      if (db.isBotBanned('member', interaction.user.id) && !ownerBypass) return;
      await commands.handleSlash(interaction, db, client);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('setup:')) {
        await commands.handleSetupInteraction(db, interaction);
        return;
      }
      if (interaction.customId.startsWith('restrict:')) {
        await restrictions.handleRestrictButton(db, interaction);
        return;
      }
      if (interaction.customId.startsWith('review:')) {
        await restrictions.handleReviewButton(db, interaction);
        return;
      }
      if (interaction.customId.startsWith('ticket:')) {
        if (runtimeFlags.botLocked) {
          await interaction.reply({ embeds: [warning(db, interaction.guild?.id, 'Tickets are disabled by bot lock.')], ephemeral: true });
          return;
        }
        await tickets.handleTicketButton(db, interaction);
        return;
      }
    }

    if (
      (interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isUserSelectMenu()) &&
      interaction.customId.startsWith('setup:')
    ) {
      await commands.handleSetupInteraction(db, interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('restrict-modal:')) {
      await restrictions.handleRestrictModal(db, interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('setup:modal:')) {
      await commands.handleSetupInteraction(db, interaction);
    }
  } catch (err) {
    const payload = { embeds: [error(db, interaction.guild?.id, err.message || 'Interaction failed.')], ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

async function handleRestrictChannelMessage(message) {
  const restrictChannel = db.getConfig(message.guild.id, 'restrict_channel');
  if (!restrictChannel || message.channel.id !== restrictChannel) return false;
  if (isBotOwner(message.author.id)) return false;

  const result = await restrictions.restrictMember(db, message.guild, message.member, client.user, {
    reason: 'Message sent in configured restrict channel',
    source: 'restrict-channel',
    lastMessage: message.content || '[no text]'
  });
  const deleted = await restrictions.deleteRecentMessagesFromUser(message.channel, message.author.id);
  await restrictions.sendRestrictLog(
    db,
    message.guild,
    message.member,
    client.user,
    result.caseId,
    'Message sent in configured restrict channel',
    'restrict-channel',
    message.content || '[no text]'
  );
  await message.channel.send({
    embeds: [
      success(
        db,
        message.guild.id,
        `${message.author} restricted from restrict channel. Deleted ${deleted} recent messages.`
      )
    ]
  }).then((sent) => setTimeout(() => sent.delete().catch(() => null), 8000)).catch(() => null);
  return true;
}

async function handleCountingMessage(message) {
  const channelId = db.getConfig(message.guild.id, 'counting_channel');
  if (!channelId || channelId !== message.channel.id) return false;

  const expected = Number(db.getState(message.guild.id, 'counting_number', 0)) + 1;
  const lastUser = db.getState(message.guild.id, 'counting_last_user', null);
  const number = Number.parseInt(message.content.trim(), 10);

  if (number !== expected || lastUser === message.author.id) {
    await message.delete().catch(() => null);
    await message.channel.send({
      embeds: [
        error(
          db,
          message.guild.id,
          lastUser === message.author.id
            ? `${message.author}, you can not count twice in a row. Next number is ${expected}.`
            : `${message.author}, wrong number. Next number is ${expected}.`
        )
      ]
    }).then((sent) => setTimeout(() => sent.delete().catch(() => null), 5000)).catch(() => null);
    return true;
  }

  db.setState(message.guild.id, 'counting_number', number);
  db.setState(message.guild.id, 'counting_last_user', message.author.id);
  await message.react('✅').catch(() => null);
  return true;
}

async function handleSticky(message) {
  const sticky = db.getConfig(message.guild.id, 'sticky');
  if (!sticky || sticky.channelId !== message.channel.id) return;
  if (sticky.lastMessageId === message.id) return;
  if (sticky.lastMessageId) {
    const previous = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    await previous?.delete().catch(() => null);
  }
  const sent = await message.channel.send({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Sticky',
        description: sticky.message,
        style: 'amber'
      })
    ]
  }).catch(() => null);
  if (sent) {
    db.setConfig(message.guild.id, 'sticky', {
      ...sticky,
      lastMessageId: sent.id
    });
  }
}

async function handleAfk(message) {
  const afk = db.getAfk(message.guild.id, message.author.id);
  const isCommand = message.content.startsWith(env.defaultPrefix) || message.content.startsWith(env.ownerPrefix);
  if (afk && !isCommand) {
    db.clearAfk(message.guild.id, message.author.id);
    await message.reply({ embeds: [success(db, message.guild.id, 'Welcome back. I removed your AFK.')] }).catch(() => null);
  }

  for (const [, user] of message.mentions.users) {
    const targetAfk = db.getAfk(message.guild.id, user.id);
    if (targetAfk) {
      await message.reply({
        embeds: [
          buildEmbed(db, message.guild.id, {
            title: 'AFK',
            description: `${user} is AFK: ${targetAfk.reason || 'AFK'}\nSince <t:${Math.floor(targetAfk.since / 1000)}:R>.`,
            style: 'amber'
          })
        ]
      }).catch(() => null);
    }
  }
}

async function handleAiMention(message) {
  const runtimeFlags = db.runtimeFlags();
  if (runtimeFlags.aiLocked || runtimeFlags.botLocked || runtimeFlags.panicMode || runtimeFlags.maintenance) {
    await message.reply({ embeds: [warning(db, message.guild.id, 'AI features are locked by the bot owner.')] }).catch(() => null);
    return;
  }

  const parsed = ai.parseAiModerationCommand(message, client.user.id);
  if (parsed) {
    if (!isGuildModerator(db, message.member)) {
      await message.reply('You need moderator permissions for AI moderation commands.');
      return;
    }
    const reasonArgs = parsed.reason.split(/\s+/).filter(Boolean);
    const args = parsed.command === 'mute'
      ? [`<@${parsed.target.id}>`, '1h', ...reasonArgs]
      : [`<@${parsed.target.id}>`, ...reasonArgs];
    await commands.handlePrefixCommand(message, db, client, parsed.command, args);
    return;
  }

  const prompt = ai.stripBotMention(message.content, client.user.id);
  if (!prompt) return;
  await message.channel.sendTyping().catch(() => null);
  const answer = await ai.askAI(prompt);
  await message.reply(answer.slice(0, 2000)).catch(() => null);
}

async function sendWelcome(member) {
  const channelId = db.getConfig(member.guild.id, 'welcome_channel');
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const template = db.getConfig(
    member.guild.id,
    'welcome_message',
    'Welcome {user} to {server}. You are member #{memberCount}.'
  );
  const description = template
    .replaceAll('{user}', `${member}`)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
  await channel.send({
    embeds: [
      buildEmbed(db, member.guild.id, {
        title: 'Welcome',
        description,
        thumbnail: member.user.displayAvatarURL(),
        style: 'emerald'
      })
    ]
  });
}

if (!env.token) {
  console.error('DISCORD_TOKEN is missing. Add it to .env before starting the bot.');
  process.exit(1);
}

client.login(env.token);
