const {
  AuditLogEvent,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require('discord.js');
const env = require('./env');
const { BotDatabase } = require('./db');
const commands = require('./commands');
const { buildEmbed, error, success, warning } = require('./embeds');
const { isBotOwner, isGuildModerator } = require('./permissions');
const ai = require('./services/ai');
const prompts = require('./services/prompts');
const progression = require('./services/progression');
const community = require('./services/community');
const restrictions = require('./services/restrictions');
const tickets = require('./services/tickets');
const dashboardControls = require('./services/dashboardControls');
const { advancedLog, systemLog } = require('./services/logger');
const watchers = require('./services/watchers');
const { startDashboard } = require('./dashboard/server');

const db = new BotDatabase(env.databasePath);
const clients = [];
let dashboardServer = null;

function createDiscordClient() {
  return new Client({
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
}

function attachClientEvents(client, botIndex) {
  const label = `bot ${botIndex + 1}`;

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag} (${label})`);

    if (env.enableSlashCommands && env.registerSlashOnReady) {
      try {
        const result = await commands.registerSlashCommands(client);
        console.log(`${client.user.tag}: ${result}`);
      } catch (err) {
        console.error(`Failed to register slash commands for ${client.user?.tag || label}:`, err);
      }
    }

    if (!dashboardServer) {
      dashboardServer = startDashboard({ client, clients, db });
    }

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
    if (await handleBotAddGuard(member, client).catch(() => false)) return;
    const reRestricted = await restrictions.reapplyRestrictionOnJoin(db, member).catch(() => false);
    if (!reRestricted) await handleAutoRole(member).catch(() => null);
    await handleAntiRaid(member, client).catch(() => null);
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

      const aiModerationEnabled = env.aiModeration &&
        configBool(message.guild.id, 'ai_moderation_enabled', true);
      const moderation = runtimeFlags.aiLocked || runtimeFlags.botLocked || !aiModerationEnabled || ownerBypass
        ? { blocked: false }
        : ai.moderateText(message.content);
      if (moderation.blocked && !isGuildModerator(db, message.member)) {
        await message.delete().catch(() => null);
        await systemLog(db, message.guild, 'ai', {
          title: 'AI Moderation',
          actor: message.author,
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

      if (await handleRestrictChannelMessage(message, client)) return;
      if (await handleCountingMessage(message)) return;

      const handledPrefix = await commands.handlePrefixMessage(message, db, client);
      if (handledPrefix) return;

      await progression.awardMessageActivity(db, message).catch(() => null);
      await handleSticky(message);
      if (await handleQnaMessage(message, client)) return;

      if (message.mentions.has(client.user)) {
        await handleAiMention(message, client);
      }
    } catch (err) {
      await message.reply({ embeds: [error(db, message.guild.id, err.message || 'Message handling failed.')] }).catch(() => null);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      const runtimeFlags = db.runtimeFlags();
      const interactionUserId = interaction.user?.id;
      const ownerBypass = isBotOwner(interactionUserId);
      if ((runtimeFlags.maintenance || runtimeFlags.panicMode) && !ownerBypass) {
        const payload = { embeds: [warning(db, interaction.guild?.id, 'The bot is in maintenance/panic mode. Try again later.')], ephemeral: true };
        await replyToInteractionOnce(interaction, payload);
        return;
      }

      if (interaction.guild && db.isBotBanned('guild', interaction.guild.id) && !ownerBypass) {
        await replyToInteractionOnce(interaction, {
          embeds: [warning(db, interaction.guild.id, 'The bot is disabled in this server.')],
          ephemeral: true
        });
        return;
      }

      if (interactionUserId && db.isBotBanned('member', interactionUserId) && !ownerBypass) {
        await replyToInteractionOnce(interaction, {
          embeds: [warning(db, interaction.guild?.id, 'You are not allowed to use this bot.')],
          ephemeral: true
        });
        return;
      }

      if (interaction.isChatInputCommand()) {
        if (!env.enableSlashCommands) {
          await replyToInteractionOnce(interaction, { embeds: [warning(db, interaction.guild?.id, 'Slash commands are disabled in .env.')], ephemeral: true });
          return;
        }
        await commands.handleSlash(interaction, db, client);
        return;
      }

      if (interaction.isButton()) {
        if (dashboardControls.hasDashboardControlResponse(db, interaction)) {
          await dashboardControls.handleDashboardControlInteraction(db, interaction);
          return;
        }
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
        if (interaction.customId.startsWith('verify:')) {
          await community.handleVerifyButton(db, interaction);
          return;
        }
        if (interaction.customId.startsWith('dashboard:')) {
          await dashboardControls.handleDashboardControlInteraction(db, interaction);
          return;
        }
        if (interaction.customId.startsWith('ticket:')) {
          if (runtimeFlags.botLocked) {
            await replyToInteractionOnce(interaction, { embeds: [warning(db, interaction.guild?.id, 'Tickets are disabled by bot lock.')], ephemeral: true });
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

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('help:')) {
        await commands.handleHelpInteraction(db, interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('dashboard:')) {
        await dashboardControls.handleDashboardControlInteraction(db, interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && dashboardControls.hasDashboardControlResponse(db, interaction)) {
        await dashboardControls.handleDashboardControlInteraction(db, interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('restrict-modal:')) {
        await restrictions.handleRestrictModal(db, interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('setup:modal:')) {
        await commands.handleSetupInteraction(db, interaction);
        return;
      }

      await handleUnhandledInteraction(interaction);
    } catch (err) {
      logInteractionError(interaction, err);
      const payload = { embeds: [error(db, interaction.guild?.id, err.message || 'Interaction failed.')], ephemeral: true };
      await replyToInteractionOnce(interaction, payload).catch((replyErr) => {
        console.error('Failed to send interaction error response:', replyErr);
      });
    }
  });
}

async function handleUnhandledInteraction(interaction) {
  if (!interaction.isRepliable?.()) return;
  console.warn('Unhandled interaction:', interactionDebugInfo(interaction));
  await replyToInteractionOnce(interaction, {
    content: 'No action is configured for this interaction.',
    ephemeral: true,
    allowedMentions: { parse: [], users: [], roles: [] }
  });
}

async function replyToInteractionOnce(interaction, payload) {
  if (!interaction.isRepliable?.() || interaction.replied) return false;
  if (interaction.deferred) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
    return true;
  }
  await interaction.reply(payload);
  return true;
}

function logInteractionError(interaction, err) {
  console.error('Interaction handling failed:', {
    ...interactionDebugInfo(interaction),
    error: err?.stack || err?.message || String(err)
  });
}

function interactionDebugInfo(interaction) {
  return {
    type: interaction.type,
    commandName: interaction.commandName || null,
    customId: interaction.customId || null,
    guildId: interaction.guild?.id || null,
    channelId: interaction.channel?.id || null,
    userId: interaction.user?.id || null,
    replied: Boolean(interaction.replied),
    deferred: Boolean(interaction.deferred)
  };
}

async function handleRestrictChannelMessage(message, client) {
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

async function handleAiMention(message, client) {
  const runtimeFlags = db.runtimeFlags();
  if (runtimeFlags.aiLocked || runtimeFlags.botLocked || runtimeFlags.panicMode || runtimeFlags.maintenance) {
    await message.reply({ embeds: [warning(db, message.guild.id, 'AI features are locked by the bot owner.')] }).catch(() => null);
    return;
  }

  const referenced = await referencedMember(message);
  const parsed = ai.parseAiModerationCommand(message, client.user.id, { targetMember: referenced });
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
    await systemLog(db, message.guild, 'ai', {
      title: 'AI Moderation Command',
      actor: message.author,
      target: parsed.target.user,
      fields: [
        { name: 'Command', value: parsed.command, inline: true },
        { name: 'Reason', value: parsed.reason || 'AI command request' }
      ]
    }).catch(() => null);
    return;
  }

  const prompt = ai.stripBotMention(message.content, client.user.id);
  if (!prompt) return;
  await message.channel.sendTyping().catch(() => null);
  const answer = await ai.askAI(prompt, {
    promptStack: prompts.buildPromptStack(db, {
      guild: message.guild,
      channel: message.channel
    })
  });
  await message.reply({
    content: answer.slice(0, 2000),
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  }).catch(() => null);
  await systemLog(db, message.guild, 'ai', {
    title: 'AI Reply',
    actor: message.author,
    fields: [
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Prompt', value: prompt.slice(0, 1000) },
      { name: 'Answer', value: answer.slice(0, 1000) }
    ]
  }).catch(() => null);
}

async function handleQnaMessage(message, client) {
  const channelId = db.getConfig(message.guild.id, 'qna_channel');
  if (!channelId || message.channel.id !== channelId) return false;
  if (message.mentions.has(client.user)) return false;
  if (!message.content.trim()) return false;

  const runtimeFlags = db.runtimeFlags();
  if (runtimeFlags.aiLocked || runtimeFlags.botLocked || runtimeFlags.panicMode || runtimeFlags.maintenance) return false;

  await message.channel.sendTyping().catch(() => null);
  const answer = await ai.askAI(message.content.slice(0, 1800), {
    personality: db.getConfig(message.guild.id, 'qna_personality', env.aiPersonality),
    promptStack: prompts.buildPromptStack(db, {
      guild: message.guild,
      channel: message.channel
    }),
    systemSuffix: 'Answer as the configured Q&A helper for this server. Be accurate and concise. Do not mention everyone, here, users, or roles.'
  });
  await message.reply({
    content: answer.slice(0, 2000),
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  }).catch(() => null);
  await systemLog(db, message.guild, 'ai', {
    title: 'Q&A Reply',
    actor: message.author,
    fields: [
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Question', value: message.content.slice(0, 1000) },
      { name: 'Answer', value: answer.slice(0, 1000) }
    ]
  }).catch(() => null);
  return true;
}

async function referencedMember(message) {
  if (!message.reference?.messageId) return null;
  const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  const userId = referencedMessage?.author?.id;
  if (!userId || referencedMessage.author.bot) return null;
  return message.guild.members.fetch(userId).catch(() => null);
}

function configBool(guildId, key, fallback = true) {
  const value = db.getConfig(guildId, key, fallback);
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled', 'enable'].includes(lowered)) return true;
  if (['0', 'false', 'no', 'off', 'disabled', 'disable'].includes(lowered)) return false;
  return fallback;
}

function configInt(guildId, key, fallback, min, max) {
  const parsed = Number.parseInt(db.getConfig(guildId, key, fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function handleAutoRole(member) {
  if (member.user.bot) return;
  const roleId = db.getConfig(member.guild.id, 'auto_role');
  if (!roleId) return;
  const role = await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === member.guild.id || member.roles.cache.has(role.id)) return;
  await member.roles.add(role, 'Configured auto role').catch(() => null);
}

async function handleAntiRaid(member, client) {
  if (member.user.bot || isBotOwner(member.id)) return;
  if (!configBool(member.guild.id, 'anti_raid_enabled', true)) return;

  const limit = configInt(member.guild.id, 'anti_raid_join_limit', 6, 2, 50);
  const windowSeconds = configInt(member.guild.id, 'anti_raid_window_seconds', 20, 5, 600);
  const cutoff = Date.now() - windowSeconds * 1000;
  const joins = db.getState(member.guild.id, 'anti_raid_join_window', [])
    .filter((entry) => entry.at >= cutoff);
  joins.push({ userId: member.id, at: Date.now() });
  db.setState(member.guild.id, 'anti_raid_join_window', joins.slice(-100));

  if (joins.length < limit) return;

  const action = String(db.getConfig(member.guild.id, 'anti_raid_action', 'restrict')).toLowerCase();
  let actionResult = 'Logged only';
  if (action === 'kick' && member.kickable) {
    await member.kick('Anti-raid join threshold reached');
    actionResult = 'Kicked newest member';
  } else if (action === 'timeout' && member.moderatable) {
    await member.timeout(10 * 60 * 1000, 'Anti-raid join threshold reached');
    actionResult = 'Timed out newest member for 10 minutes';
  } else if (action === 'restrict') {
    await restrictions.restrictMember(db, member.guild, member, client.user, {
      reason: `Anti-raid threshold: ${joins.length} joins in ${windowSeconds}s`,
      source: 'anti-raid'
    }).then((result) => {
      actionResult = `Restricted newest member. Case #${result.caseId}`;
    }).catch((err) => {
      actionResult = `Restrict failed: ${err.message}`;
    });
  }

  await systemLog(db, member.guild, 'security', {
    title: 'Anti-Raid Triggered',
    target: member.user,
    fields: [
      { name: 'Window', value: `${joins.length}/${limit} joins in ${windowSeconds}s`, inline: true },
      { name: 'Action', value: actionResult, inline: true }
    ]
  }).catch(() => null);
}

async function handleBotAddGuard(member, client) {
  if (!member.user.bot || member.id === client.user.id) return false;
  if (!configBool(member.guild.id, 'bot_add_guard_enabled', true)) return false;

  const entry = await fetchRecentBotAddAudit(member.guild, member.id);
  const executor = entry?.executor || null;
  const allowed = executor && (executor.id === member.guild.ownerId || isBotOwner(executor.id));

  if (allowed) {
    await systemLog(db, member.guild, 'security', {
      title: 'Bot Add Allowed',
      target: member.user,
      actor: executor,
      fields: [{ name: 'Reason', value: 'Added by server owner or protected bot owner.' }]
    }).catch(() => null);
    return false;
  }

  const reason = executor
    ? `Bot added by unauthorized user ${executor.tag || executor.id}`
    : 'Bot added by unknown user; audit log unavailable';
  let kicked = false;
  if (member.kickable) {
    await member.kick(reason).then(() => { kicked = true; }).catch(() => null);
  }

  await systemLog(db, member.guild, 'security', {
    title: kicked ? 'Unauthorized Bot Kicked' : 'Unauthorized Bot Detected',
    target: member.user,
    actor: executor,
    fields: [
      { name: 'Result', value: kicked ? 'Kicked immediately' : 'Could not kick; check my role position and permissions.', inline: true },
      { name: 'Reason', value: reason }
    ]
  }).catch(() => null);
  return kicked;
}

async function fetchRecentBotAddAudit(guild, targetId) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return null;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
  if (!logs) return null;
  const recentCutoff = Date.now() - 30 * 1000;
  return logs.entries.find((entry) => {
    const targetMatches = entry.target?.id === targetId;
    const recent = Number(entry.createdTimestamp || 0) >= recentCutoff;
    return targetMatches && recent;
  }) || null;
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

if (!env.tokens.length) {
  console.error('No Discord bot tokens found. Add DISCORD_TOKEN, DISCORD_TOKENS, or DISCORD_TOKEN_1/DISCORD_TOKEN_2 to .env before starting the bot.');
  process.exit(1);
}

for (const [index, token] of env.tokens.entries()) {
  const client = createDiscordClient();
  clients.push(client);
  attachClientEvents(client, index);
  client.login(token).catch((err) => {
    console.error(`Failed to login bot ${index + 1}:`, err);
  });
}

watchers.startWatchers(clients, db, restrictions);
