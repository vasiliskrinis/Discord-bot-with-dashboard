const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { buildEmbed, error, success, warning } = require('../embeds');
const staff = require('./staff');

const BUTTON_STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger
};

function panelIdFromName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `panel-${Date.now()}`;
}

function ticketMode(value) {
  return String(value || '').toLowerCase() === 'channel' ? 'channel' : 'thread';
}

function panelFromRow(row) {
  if (!row) return null;
  return {
    panelId: row.panel_id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    supportRoleId: row.support_role_id,
    mode: ticketMode(row.mode),
    panelContent: row.panel_content,
    buttonLabel: row.button_label,
    buttonStyle: row.button_style,
    buttonEmoji: row.button_emoji,
    openMessage: row.open_message,
    closeButtonLabel: row.close_button_label,
    deleteButtonLabel: row.delete_button_label,
    panelChannelId: row.panel_channel_id,
    panelMessageId: row.panel_message_id,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function normalizePanelData(data, fallback = {}) {
  const name = String(data.name ?? fallback.name ?? 'Support Tickets').trim().slice(0, 80) || 'Support Tickets';
  return {
    panelId: String(data.panelId || fallback.panelId || panelIdFromName(name)).trim().slice(0, 40),
    name,
    description: String(data.description ?? fallback.description ?? 'Open a ticket and the support team will help you.').trim().slice(0, 1500),
    categoryId: data.categoryId ?? fallback.categoryId ?? null,
    supportRoleId: data.supportRoleId ?? fallback.supportRoleId ?? null,
    mode: ticketMode(data.mode ?? fallback.mode),
    panelContent: optionalText(data.panelContent ?? fallback.panelContent, 1900),
    buttonLabel: optionalText(data.buttonLabel ?? fallback.buttonLabel, 80) || 'Open Ticket',
    buttonStyle: buttonStyleKey(data.buttonStyle ?? fallback.buttonStyle),
    buttonEmoji: optionalText(data.buttonEmoji ?? fallback.buttonEmoji, 80),
    openMessage: optionalText(data.openMessage ?? fallback.openMessage, 1900),
    closeButtonLabel: optionalText(data.closeButtonLabel ?? fallback.closeButtonLabel, 80) || 'Close Ticket',
    deleteButtonLabel: optionalText(data.deleteButtonLabel ?? fallback.deleteButtonLabel, 80) || 'Delete Ticket',
    panelChannelId: data.panelChannelId ?? fallback.panelChannelId ?? null,
    panelMessageId: data.panelMessageId ?? fallback.panelMessageId ?? null,
    createdBy: data.createdBy ?? fallback.createdBy ?? null,
    createdAt: data.createdAt ?? fallback.createdAt ?? Date.now()
  };
}

function optionalText(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function buttonStyleKey(value) {
  const key = String(value || 'primary').toLowerCase();
  return BUTTON_STYLES[key] ? key : 'primary';
}

function ticketPanelComponents(panel) {
  const button = new ButtonBuilder()
    .setCustomId(`ticket:open:${panel.panelId}`)
    .setLabel(panel.buttonLabel || 'Open Ticket')
    .setStyle(BUTTON_STYLES[buttonStyleKey(panel.buttonStyle)] || ButtonStyle.Primary);
  if (panel.buttonEmoji) button.setEmoji(panel.buttonEmoji);
  return [new ActionRowBuilder().addComponents(button)];
}

function ticketPanelPayload(db, guildId, panel) {
  return {
    content: panel.panelContent || undefined,
    embeds: [
      buildEmbed(db, guildId, {
        title: panel.name,
        description: panel.description || 'Open a ticket and the support team will help you.',
        style: 'sapphire'
      })
    ],
    components: ticketPanelComponents(panel),
    allowedMentions: { parse: [], users: [], roles: [] }
  };
}

async function sendSetupReply(target, payload) {
  if (!target.reply) return;
  const isInteraction = Boolean(target.commandName || target.isModalSubmit?.());
  await target.reply(isInteraction ? { ...payload, ephemeral: true } : payload);
}

async function sendTicketPanel(db, target, data) {
  const panel = normalizePanelData({
    ...data,
    createdBy: target.user?.id || data.createdBy
  });

  db.saveTicketPanel(target.guild.id, panel);
  const message = await target.channel.send(ticketPanelPayload(db, target.guild.id, panel));
  const saved = {
    ...panel,
    panelChannelId: message.channel.id,
    panelMessageId: message.id
  };
  db.saveTicketPanel(target.guild.id, saved);

  await sendSetupReply(target, {
    embeds: [success(db, target.guild.id, `Ticket panel \`${panel.panelId}\` created in ${message.channel}. Mode: **${panel.mode}**.`)]
  });
  return saved;
}

async function updateTicketPanel(db, guild, panelId, patch) {
  const existing = panelFromRow(db.getTicketPanel(guild.id, panelId));
  if (!existing) throw new Error(`Ticket panel \`${panelId}\` was not found.`);
  const panel = normalizePanelData({ ...patch, panelId: existing.panelId }, existing);
  db.saveTicketPanel(guild.id, panel);

  let edited = false;
  if (panel.panelChannelId && panel.panelMessageId) {
    const channel = await guild.channels.fetch(panel.panelChannelId).catch(() => null);
    const message = channel?.isTextBased?.()
      ? await channel.messages.fetch(panel.panelMessageId).catch(() => null)
      : null;
    if (message) {
      await message.edit(ticketPanelPayload(db, guild.id, panel));
      edited = true;
    }
  }

  return { panel, edited };
}

async function handleTicketButton(db, interaction) {
  if (db.runtimeFlags().botLocked) {
    await interaction.reply({ embeds: [warning(db, interaction.guild.id, 'Tickets are disabled by bot lock.')], ephemeral: true });
    return true;
  }

  const [, action, panelId] = interaction.customId.split(':');
  if (action === 'open') {
    await openTicket(db, interaction, panelId);
    return true;
  }
  if (action === 'close') {
    await closeTicket(db, interaction);
    return true;
  }
  if (action === 'delete') {
    await interaction.reply({ embeds: [warning(db, interaction.guild.id, 'Deleting ticket in 3 seconds.')] });
    setTimeout(() => interaction.channel.delete('Ticket deleted').catch(() => null), 3000);
    return true;
  }
  return false;
}

async function openTicket(db, interaction, panelId) {
  const panel = panelFromRow(db.getTicketPanel(interaction.guild.id, panelId));
  if (!panel) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'Ticket panel was not found.')], ephemeral: true });
    return;
  }

  const existing = db.getOpenTicket(interaction.guild.id, panelId, interaction.user.id);
  if (existing) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, `You already have a ticket for this panel: <#${existing.channel_id}>`)], ephemeral: true });
    return;
  }

  const ticketName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
  const channel = panel.mode === 'channel'
    ? await createTicketChannel(interaction, panel, ticketName)
    : await createTicketThread(interaction, panel, ticketName).catch(() => null) ||
      await createTicketChannel(interaction, panel, ticketName);

  db.saveTicket(interaction.guild.id, panelId, interaction.user.id, channel.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${panelId}`)
      .setLabel(panel.closeButtonLabel || 'Close Ticket')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket:delete:${panelId}`)
      .setLabel(panel.deleteButtonLabel || 'Delete Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  const content = formatTicketText(panel.openMessage, interaction, channel) ||
    `${interaction.user}${panel.supportRoleId ? ` <@&${panel.supportRoleId}>` : ''}`;

  await channel.send({
    content,
    allowedMentions: {
      users: [interaction.user.id],
      roles: panel.supportRoleId ? [panel.supportRoleId] : [],
      parse: []
    },
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: panel.name,
        description: panel.description || 'Support will be with you soon.',
        style: 'ocean'
      })
    ],
    components: [row]
  });

  await interaction.reply({ embeds: [success(db, interaction.guild.id, `Ticket opened: ${channel}`)], ephemeral: true });
}

function ticketOverwrites(interaction, panel) {
  const overwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    },
    {
      id: interaction.client.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
    }
  ];

  if (panel.supportRoleId) {
    overwrites.push({
      id: panel.supportRoleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }

  return overwrites;
}

async function createTicketChannel(interaction, panel, ticketName) {
  return interaction.guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: panel.categoryId || undefined,
    topic: `Ticket ${panel.panelId} for ${interaction.user.id}`,
    permissionOverwrites: ticketOverwrites(interaction, panel)
  });
}

async function createTicketThread(interaction, panel, ticketName) {
  if (!interaction.channel?.threads?.create) return null;
  const thread = await interaction.channel.threads.create({
    name: ticketName,
    type: ChannelType.PublicThread,
    autoArchiveDuration: 10080,
    reason: `Ticket ${panel.panelId} for ${interaction.user.tag}`
  });
  await thread.members.add(interaction.user.id).catch(() => null);
  await thread.join?.().catch(() => null);
  return thread;
}

function formatTicketText(text, interaction, channel) {
  if (!text) return null;
  return text
    .replaceAll('{user}', `${interaction.user}`)
    .replaceAll('{username}', interaction.user.username)
    .replaceAll('{server}', interaction.guild.name)
    .replaceAll('{ticket}', `${channel}`)
    .slice(0, 1900);
}

async function closeTicket(db, interaction) {
  const ticket = db.getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'This channel is not an open ticket.')], ephemeral: true });
    return;
  }
  db.closeTicket(interaction.guild.id, interaction.channel.id);
  if (staff.canUseStaffSystem(db, interaction.member)) {
    staff.incrementStaffStat(db, interaction.guild.id, interaction.user.id, 'tickets');
  }
  await interaction.reply({ embeds: [success(db, interaction.guild.id, 'Ticket closed.')] });
  if (interaction.channel.isThread?.()) {
    await interaction.channel.setArchived(true, 'Ticket closed').catch(() => null);
  } else {
    await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => null);
  }
}

module.exports = {
  sendTicketPanel,
  updateTicketPanel,
  panelFromRow,
  normalizePanelData,
  handleTicketButton
};
