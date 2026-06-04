const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { buildEmbed, error, success, warning } = require('../embeds');

function panelIdFromName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `panel-${Date.now()}`;
}

async function sendTicketPanel(db, interaction, data) {
  const panelId = panelIdFromName(data.name);
  db.saveTicketPanel(interaction.guild.id, {
    panelId,
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    supportRoleId: data.supportRoleId,
    createdBy: interaction.user.id,
    createdAt: Date.now()
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:open:${panelId}`)
      .setLabel('Open Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: data.name,
        description: data.description || 'Open a ticket and the support team will help you.',
        style: 'sapphire'
      })
    ],
    components: [row]
  });

  await interaction.reply({ embeds: [success(db, interaction.guild.id, `Ticket panel \`${panelId}\` created.`)], ephemeral: true });
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
  const panel = db.getTicketPanel(interaction.guild.id, panelId);
  if (!panel) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'Ticket panel was not found.')], ephemeral: true });
    return;
  }

  const existing = db.getOpenTicket(interaction.guild.id, panelId, interaction.user.id);
  if (existing) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, `You already have a ticket for this panel: <#${existing.channel_id}>`)], ephemeral: true });
    return;
  }

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

  if (panel.support_role_id) {
    overwrites.push({
      id: panel.support_role_id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }

  const ticketName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
  const channel = await createTicketThread(interaction, panel, ticketName).catch(() => null) ||
    await interaction.guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: panel.category_id || undefined,
      topic: `Ticket ${panelId} for ${interaction.user.id}`,
      permissionOverwrites: overwrites
    });

  db.saveTicket(interaction.guild.id, panelId, interaction.user.id, channel.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${panelId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket:delete:${panelId}`)
      .setLabel('Delete Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${interaction.user}${panel.support_role_id ? ` <@&${panel.support_role_id}>` : ''}`,
    allowedMentions: {
      users: [interaction.user.id],
      roles: panel.support_role_id ? [panel.support_role_id] : [],
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

async function createTicketThread(interaction, panel, ticketName) {
  if (!interaction.channel?.threads?.create) return null;
  const thread = await interaction.channel.threads.create({
    name: ticketName,
    type: ChannelType.PublicThread,
    autoArchiveDuration: 10080,
    reason: `Ticket ${panel.panel_id} for ${interaction.user.tag}`
  });
  await thread.members.add(interaction.user.id).catch(() => null);
  await thread.join?.().catch(() => null);
  return thread;
}

async function closeTicket(db, interaction) {
  const ticket = db.getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ embeds: [error(db, interaction.guild.id, 'This channel is not an open ticket.')], ephemeral: true });
    return;
  }
  db.closeTicket(interaction.guild.id, interaction.channel.id);
  await interaction.reply({ embeds: [success(db, interaction.guild.id, 'Ticket closed.')] });
  if (interaction.channel.isThread?.()) {
    await interaction.channel.setArchived(true, 'Ticket closed').catch(() => null);
  } else {
    await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => null);
  }
}

module.exports = {
  sendTicketPanel,
  handleTicketButton
};
