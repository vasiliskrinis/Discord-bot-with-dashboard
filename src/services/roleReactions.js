const { buildEmbed, success } = require('../embeds');

function cleanPanelId(value, fallback = 'roles') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `roles-${Date.now()}`;
}

function optionalText(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function emojiKeyFromInput(value) {
  const text = String(value || '').trim();
  const customMatch = text.match(/^<a?:[a-z0-9_]+:(\d+)>$/i) || text.match(/^(\d{15,25})$/);
  return customMatch ? customMatch[1] : text;
}

function emojiKeyFromReaction(reaction) {
  return reaction?.emoji?.id || reaction?.emoji?.name || '';
}

function panelFromRow(row, options = []) {
  if (!row) return null;
  return {
    panelId: row.panel_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    content: row.content,
    source: row.source || 'bot',
    removeOnUnreact: row.remove_on_unreact !== 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    options: options.map(optionFromRow)
  };
}

function optionFromRow(row) {
  return {
    emoji: row.emoji,
    emojiKey: row.emoji_key,
    roleId: row.role_id,
    label: row.label,
    position: row.position
  };
}

function normalizeOptions(options) {
  const rows = Array.isArray(options) ? options : [];
  const byEmoji = new Map();
  rows.forEach((row, index) => {
    const emoji = optionalText(row.emoji, 80);
    const roleId = String(row.roleId || row.role_id || row.role || '').replace(/[<@&>]/g, '').trim();
    const emojiKey = emojiKeyFromInput(emoji);
    if (!emoji || !emojiKey || !roleId) return;
    byEmoji.set(emojiKey, {
      emoji,
      emojiKey,
      roleId,
      label: optionalText(row.label, 80),
      position: Number.isFinite(row.position) ? row.position : index
    });
  });
  return [...byEmoji.values()].slice(0, 20);
}

function normalizePanelData(data, fallback = {}) {
  const title = optionalText(data.title ?? fallback.title, 120) || 'Choose Your Roles';
  return {
    panelId: cleanPanelId(data.panelId || data.id || fallback.panelId || title),
    channelId: String(data.channelId || fallback.channelId || '').trim(),
    messageId: String(data.messageId || fallback.messageId || '').trim() || null,
    title,
    description: optionalText(data.description ?? fallback.description, 1800) || 'React below to get or remove roles.',
    content: optionalText(data.content ?? fallback.content, 1900),
    source: data.source === 'existing' ? 'existing' : 'bot',
    removeOnUnreact: data.removeOnUnreact !== false,
    createdBy: data.createdBy || fallback.createdBy || null,
    createdAt: fallback.createdAt || Date.now(),
    options: normalizeOptions(data.options || fallback.options)
  };
}

function roleReactionPayload(db, guildId, panel) {
  const description = [
    panel.description || 'React below to get or remove roles.',
    '',
    ...panel.options.map((option) => `${option.emoji} - <@&${option.roleId}>${option.label ? ` (${option.label})` : ''}`)
  ].join('\n').slice(0, 3900);
  return {
    content: panel.content || undefined,
    embeds: [
      buildEmbed(db, guildId, {
        title: panel.title,
        description,
        footer: panel.removeOnUnreact ? 'Remove your reaction to remove the role.' : 'React to get the role.',
        style: 'sapphire'
      })
    ],
    allowedMentions: { parse: [], users: [], roles: [] }
  };
}

async function fetchTextChannel(guild, channelId) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function fetchTargetMessage(guild, channelId, messageId) {
  const channel = await fetchTextChannel(guild, channelId);
  if (!channel) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  return message || null;
}

async function addPanelReactions(message, options) {
  for (const option of options) {
    await message.react(option.emoji).catch((err) => {
      throw new Error(`Could not add reaction ${option.emoji}: ${err.message || 'invalid emoji'}`);
    });
  }
}

async function createOrUpdateRoleReactionPanel(db, guild, data) {
  const existing = data.panelId ? loadPanel(db, guild.id, data.panelId) : null;
  const panel = normalizePanelData(data, existing || {});
  if (!panel.options.length) throw new Error('Add at least one emoji and role.');
  const missingRole = panel.options.find((option) => !guild.roles.cache.has(option.roleId));
  if (missingRole) throw new Error(`Role for ${missingRole.emoji} was not found.`);

  let message = null;
  if (panel.source === 'existing') {
    if (!panel.channelId || !panel.messageId) throw new Error('Choose a channel and existing message ID or link.');
    message = await fetchTargetMessage(guild, panel.channelId, panel.messageId);
    if (!message) throw new Error('Existing message was not found.');
  } else {
    const channel = await fetchTextChannel(guild, panel.channelId);
    if (!channel) throw new Error('Choose a text channel for the role reaction message.');
    message = await channel.send(roleReactionPayload(db, guild.id, panel));
  }

  await addPanelReactions(message, panel.options);
  const saved = {
    ...panel,
    channelId: message.channel.id,
    messageId: message.id
  };
  db.saveRoleReactionPanel(guild.id, saved, saved.options);
  return {
    panel: saved,
    url: message.url
  };
}

function loadPanel(db, guildId, panelId) {
  const row = db.getRoleReactionPanel(guildId, panelId);
  return panelFromRow(row, row ? db.listRoleReactionOptions(guildId, panelId) : []);
}

function loadPanelByMessage(db, guildId, channelId, messageId) {
  const row = db.getRoleReactionPanelByMessage(guildId, channelId, messageId);
  return panelFromRow(row, row ? db.listRoleReactionOptions(guildId, row.panel_id) : []);
}

async function handleReactionAdd(db, reaction, user) {
  return handleReaction(db, reaction, user, 'add');
}

async function handleReactionRemove(db, reaction, user) {
  return handleReaction(db, reaction, user, 'remove');
}

async function handleReaction(db, reaction, user, action) {
  if (user?.bot) return false;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);
  const message = reaction.message;
  const guild = message?.guild;
  if (!guild) return false;

  const panel = loadPanelByMessage(db, guild.id, message.channel.id, message.id);
  if (!panel) return false;
  const emojiKey = emojiKeyFromReaction(reaction);
  const option = panel.options.find((item) => item.emojiKey === emojiKey);
  if (!option) return false;

  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(option.roleId);
  if (!member || !role) return false;
  if (action === 'add') {
    if (db.getActiveRestriction(guild.id, user.id)) return true;
    await member.roles.add(role, `Reaction role ${panel.panelId}`).catch(() => null);
    return true;
  }
  if (panel.removeOnUnreact) {
    await member.roles.remove(role, `Reaction role ${panel.panelId} removed`).catch(() => null);
  }
  return true;
}

async function sendSetupReply(db, target, result) {
  if (!target.reply) return;
  await target.reply({
    embeds: [success(db, target.guild.id, `Reaction-role panel \`${result.panel.panelId}\` is tracking ${result.panel.options.length} role option(s).${result.url ? `\n${result.url}` : ''}`)],
    allowedMentions: { parse: [], users: [], roles: [] }
  });
}

module.exports = {
  createOrUpdateRoleReactionPanel,
  emojiKeyFromInput,
  emojiKeyFromReaction,
  handleReactionAdd,
  handleReactionRemove,
  loadPanel,
  normalizeOptions,
  normalizePanelData,
  optionFromRow,
  panelFromRow,
  roleReactionPayload,
  sendSetupReply
};
