const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const env = require('../env');
const { buildEmbed, error, success, warning } = require('../embeds');
const { canUseRestrictButtons, isBotOwner } = require('../permissions');
const { moderationLog } = require('./logger');

function visibleRoleIds(member, restrictedRoleId) {
  return member.roles.cache
    .filter((role) => role.id !== member.guild.id && role.id !== restrictedRoleId && !role.managed)
    .map((role) => role.id);
}

async function restrictMember(db, guild, member, moderator, options = {}) {
  if (!member) throw new Error('Member not found.');
  if (env.botOwnerId && member.id === env.botOwnerId) {
    throw new Error('The protected bot owner ID can not be restricted.');
  }

  const restrictedRoleId = db.getConfig(guild.id, 'restricted_role');
  if (!restrictedRoleId) throw new Error('Restricted role is not configured. Use /setup.');
  const restrictedRole = await guild.roles.fetch(restrictedRoleId).catch(() => null);
  if (!restrictedRole) throw new Error('Configured restricted role was not found.');

  const existing = db.getActiveRestriction(guild.id, member.id);
  const originalRoles = existing?.original_roles?.length
    ? existing.original_roles
    : visibleRoleIds(member, restrictedRoleId);

  await member.roles.set([restrictedRoleId], options.reason || 'Restricted by bot');

  const expiresAt = options.durationMs ? Date.now() + options.durationMs : null;
  db.setRestriction(guild.id, member.id, {
    active: true,
    originalRoles,
    restrictedBy: moderator?.id || 'system',
    reason: options.reason || 'No reason provided',
    source: options.source || 'command',
    expiresAt,
    lastMessage: options.lastMessage || null
  });

  const caseId = db.createCase(guild.id, 'RESTRICT', member.id, moderator?.id || 'system', options.reason, {
    source: options.source || 'command',
    expiresAt,
    originalRoles
  });

  await moderationLog(db, guild, caseId, 'Restrict', member.user, moderator, options.reason, [
    { name: 'Source', value: options.source || 'command', inline: true },
    { name: 'Expires', value: expiresAt ? `<t:${Math.floor(expiresAt / 1000)}:R>` : 'Permanent', inline: true }
  ]);

  return { caseId, expiresAt, originalRoles };
}

async function unrestrictMember(db, guild, member, moderator, reason = 'No reason provided') {
  if (!member) throw new Error('Member not found.');
  const restrictedRoleId = db.getConfig(guild.id, 'restricted_role');
  const restriction = db.getActiveRestriction(guild.id, member.id);
  const rolesToRestore = restriction?.original_roles || [];

  if (restrictedRoleId && member.roles.cache.has(restrictedRoleId)) {
    await member.roles.remove(restrictedRoleId, reason).catch(() => null);
  }

  const restorable = [];
  for (const roleId of rolesToRestore) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (role && !role.managed && role.id !== guild.id) restorable.push(role.id);
  }

  if (restorable.length) {
    await member.roles.add(restorable, reason).catch(() => null);
  }

  db.clearRestriction(guild.id, member.id);
  const caseId = db.createCase(guild.id, 'UNRESTRICT', member.id, moderator?.id || 'system', reason, {
    restoredRoles: restorable
  });
  await moderationLog(db, guild, caseId, 'Unrestrict', member.user, moderator, reason, [
    { name: 'Restored Roles', value: restorable.length ? restorable.map((id) => `<@&${id}>`).join(', ') : 'None' }
  ]);

  return { caseId, restoredRoles: restorable };
}

async function deleteRecentMessagesFromUser(channel, userId) {
  if (!channel?.isTextBased() || !channel.bulkDelete) return 0;
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return 0;
  const cutoff = Date.now() - 10 * 60 * 1000;
  const targets = messages.filter((message) => message.author.id === userId && message.createdTimestamp >= cutoff);
  if (!targets.size) return 0;
  const deleted = await channel.bulkDelete(targets, true).catch(() => null);
  return deleted?.size || 0;
}

async function sendRestrictLog(db, guild, member, moderator, caseId, reason, source, lastMessage) {
  const channelId = db.getConfig(guild.id, 'restrict_logs_channel');
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`restrict:accept:${member.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`restrict:decline:${member.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`restrict:past:${member.id}`)
        .setLabel('Past Logs')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`restrict:review:${member.id}`)
        .setLabel('Review')
        .setStyle(ButtonStyle.Primary)
    )
  ];

  return channel.send({
    embeds: [
      buildEmbed(db, guild.id, {
        title: `Restrict Log - Case #${caseId}`,
        style: source === 'restrict-channel' ? 'amber' : 'ruby',
        fields: [
          { name: 'Member', value: `${member.user} (${member.id})`, inline: true },
          { name: 'Moderator', value: moderator ? `${moderator}` : 'System', inline: true },
          { name: 'Source', value: source || 'command', inline: true },
          { name: 'Reason', value: reason || 'No reason provided' },
          { name: 'Message', value: lastMessage || 'No captured message' }
        ]
      })
    ],
    components: rows
  });
}

function makeReasonModal(action, userId, messageId) {
  return new ModalBuilder()
    .setCustomId(`restrict-modal:${action}:${userId}:${messageId || 'none'}`)
    .setTitle(action === 'accept' ? 'Accept Restriction' : 'Decline Restriction')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

function buildRestrictionDecisionEmbed(db, guildId, member, moderator, action, reason, caseId, restoredRoles = []) {
  const accepted = action === 'accept';
  return buildEmbed(db, guildId, {
    title: accepted ? 'User Restricted' : 'User Unrestricted',
    style: accepted ? 'ruby' : 'emerald',
    fields: [
      { name: 'Member', value: `${member.user} (${member.id})`, inline: true },
      { name: 'Moderator', value: `${moderator.user} (${moderator.id})`, inline: true },
      { name: 'Decision', value: accepted ? 'Accepted - user remains restricted' : 'Declined - roles restored and user unrestricted' },
      { name: 'Reason', value: reason || 'No reason provided' },
      { name: 'Case', value: caseId ? `#${caseId}` : 'No case', inline: true },
      {
        name: 'Restored Roles',
        value: restoredRoles.length ? restoredRoles.map((roleId) => `<@&${roleId}>`).join(', ') : (accepted ? 'Still restricted' : 'None'),
        inline: true
      }
    ]
  });
}

async function sendRestrictionDecision(db, guild, member, moderator, action, reason, caseId, restoredRoles = []) {
  const channelId = db.getConfig(guild.id, 'restricted_users_channel');
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel.send({
    embeds: [buildRestrictionDecisionEmbed(db, guild.id, member, moderator, action, reason, caseId, restoredRoles)]
  });
}

async function updateRestrictReviewMessage(db, interaction, member, moderator, action, reason, caseId, restoredRoles = [], messageId = null) {
  if (!messageId || messageId === 'none') return;
  const channelIds = [interaction.channelId, db.getConfig(interaction.guild.id, 'restrict_logs_channel')].filter(Boolean);
  let message = null;
  for (const channelId of [...new Set(channelIds)]) {
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;
    message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) break;
  }
  if (!message) return;
  await message.edit({
    embeds: [buildRestrictionDecisionEmbed(db, interaction.guild.id, member, moderator, action, reason, caseId, restoredRoles)],
    components: []
  }).catch(() => null);
}

async function handleRestrictButton(db, interaction) {
  const [, action, userId] = interaction.customId.split(':');
  const member = interaction.member;

  if (action !== 'past' && !canUseRestrictButtons(db, member)) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'You need an authorized role to use this button.')], ephemeral: true });
    return true;
  }

  if (action === 'past') {
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({ embeds: [error(db, interaction.guild.id, 'Only the bot owner can view past logs from this button.')], ephemeral: true });
      return true;
    }
    const cases = db.listCases(interaction.guild.id, userId, 10);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Past Logs',
          description: cases.length
            ? cases
                .map((entry) => `#${entry.case_id} ${entry.type} - ${entry.reason || 'No reason'} (<t:${Math.floor(entry.created_at / 1000)}:R>)`)
                .join('\n')
            : 'No past logs found.',
          style: 'royal'
        })
      ],
      ephemeral: true
    });
    return true;
  }

  if (action === 'review') {
    await openReviewChannel(db, interaction, userId);
    return true;
  }

  if (action === 'accept' || action === 'decline') {
    await interaction.showModal(makeReasonModal(action, userId, interaction.message?.id));
    return true;
  }

  return false;
}

async function handleRestrictModal(db, interaction) {
  const [, action, userId, messageId] = interaction.customId.split(':');
  const reason = interaction.fields.getTextInputValue('reason');
  const target = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!target) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'That member is not in the server.')], ephemeral: true });
    return true;
  }

  if (action === 'accept') {
    const caseId = db.createCase(interaction.guild.id, 'RESTRICT_ACCEPT', userId, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Restriction Accepted', target.user, interaction.user, reason);
    await sendRestrictionDecision(db, interaction.guild, target, interaction.member, 'accept', reason, caseId);
    await updateRestrictReviewMessage(db, interaction, target, interaction.member, 'accept', reason, caseId, [], messageId);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, 'Restriction accepted. The member stays restricted.')], ephemeral: true });
    return true;
  }

  if (action === 'decline') {
    const result = await unrestrictMember(db, interaction.guild, target, interaction.user, reason);
    await sendRestrictionDecision(db, interaction.guild, target, interaction.member, 'decline', reason, result.caseId, result.restoredRoles);
    await updateRestrictReviewMessage(db, interaction, target, interaction.member, 'decline', reason, result.caseId, result.restoredRoles, messageId);
    await interaction.reply({
      embeds: [success(db, interaction.guild.id, `Restriction declined and member unrestricted. Case #${result.caseId}.`)],
      ephemeral: true
    });
    return true;
  }

  return false;
}

async function openReviewChannel(db, interaction, userId) {
  const target = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!target) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'That member is not in the server.')], ephemeral: true });
    return;
  }

  const channel = await interaction.guild.channels.create({
    name: `review-${target.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
    type: ChannelType.GuildText,
    topic: `Restriction review for ${target.id}. Opened by ${interaction.user.id}.`,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: target.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      },
      {
        id: interaction.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      },
      {
        id: interaction.client.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
      }
    ]
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`review:close:${target.id}`)
      .setLabel('Close Channel')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`review:delete:${target.id}`)
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${target} ${interaction.user}`,
    embeds: [
      warning(
        db,
        interaction.guild.id,
        'This private review channel was opened for the restricted member and moderator.'
      )
    ],
    components: [row]
  });

  await interaction.reply({ embeds: [success(db, interaction.guild.id, `Review channel opened: ${channel}`)], ephemeral: true });
}

async function handleReviewButton(db, interaction) {
  const [, action, userId] = interaction.customId.split(':');
  if (!canUseRestrictButtons(db, interaction.member)) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'You need an authorized role to use review channel buttons.')], ephemeral: true });
    return true;
  }

  if (action === 'close') {
    await interaction.channel.permissionOverwrites.edit(userId, {
      SendMessages: false,
      ViewChannel: true
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, 'Review channel closed for the restricted member.')] });
    return true;
  }

  if (action === 'delete') {
    await interaction.reply({ embeds: [warning(db, interaction.guild.id, 'Deleting this review channel in 3 seconds.')] });
    setTimeout(() => interaction.channel.delete('Review channel deleted').catch(() => null), 3000);
    return true;
  }

  return false;
}

async function reapplyRestrictionOnJoin(db, member) {
  const restriction = db.getActiveRestriction(member.guild.id, member.id);
  if (!restriction) return false;
  const roleId = db.getConfig(member.guild.id, 'restricted_role');
  if (!roleId) return false;
  await member.roles.set([roleId], 'Active restriction reapplied after rejoin').catch(() => null);
  await moderationLog(db, member.guild, 0, 'Restriction Reapplied', member.user, null, restriction.reason, [
    { name: 'Reason', value: 'Member left and joined back while restricted.' }
  ]);
  return true;
}

async function expireDueRestrictions(db, client) {
  const due = db.dueRestrictions();
  for (const restriction of due) {
    const guild = await client.guilds.fetch(restriction.guild_id).catch(() => null);
    if (!guild) continue;
    const member = await guild.members.fetch(restriction.user_id).catch(() => null);
    if (!member) continue;
    await unrestrictMember(db, guild, member, client.user, 'Temporary restriction expired').catch(() => null);
  }
}

module.exports = {
  restrictMember,
  unrestrictMember,
  deleteRecentMessagesFromUser,
  sendRestrictLog,
  handleRestrictButton,
  handleRestrictModal,
  handleReviewButton,
  reapplyRestrictionOnJoin,
  expireDueRestrictions
};
