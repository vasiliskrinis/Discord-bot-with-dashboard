const { buildEmbed } = require('../embeds');

const LOG_THEMES = {
  moderation: { title: 'Moderation', style: 'ruby', tag: '[MOD]' },
  security: { title: 'Security', style: 'amber', tag: '[SEC]' },
  ai: { title: 'AI', style: 'violet', tag: '[AI]' },
  tickets: { title: 'Tickets', style: 'sapphire', tag: '[TICKET]' },
  config: { title: 'Config', style: 'emerald', tag: '[CFG]' },
  errors: { title: 'Errors', style: 'ruby', tag: '[ERR]' },
  system: { title: 'System', style: 'royal', tag: '[SYS]' }
};

const recentLogs = [];

function trim(value, max = 1024) {
  const text = String(value || 'None');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function rememberLog(type, payload = {}) {
  recentLogs.unshift({
    type,
    level: payload.level || 'info',
    title: payload.title || LOG_THEMES[type]?.title || 'Log',
    message: trim(payload.description || payload.reason || '', 500),
    createdAt: Date.now()
  });
  recentLogs.splice(50);
}

function getRecentLogs(limit = 10) {
  return recentLogs.slice(0, Math.max(1, Math.min(limit, 50)));
}

async function sendToConfiguredChannel(db, guild, key, embed) {
  const channelId = db.getConfig(guild.id, key);
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

function createLogEmbed(db, guild, type, payload = {}) {
  const theme = LOG_THEMES[type] || LOG_THEMES.system;
  const fields = [];

  if (payload.target) {
    fields.push({
      name: 'Target',
      value: trim(`${payload.target} (${payload.target.id || payload.target.user?.id || 'unknown'})`),
      inline: true
    });
  }

  if (payload.actor) {
    fields.push({
      name: 'Actor',
      value: trim(`${payload.actor} (${payload.actor.id || payload.actor.user?.id || 'unknown'})`),
      inline: true
    });
  }

  for (const field of payload.fields || []) {
    fields.push({
      name: trim(field.name, 256),
      value: trim(field.value, 1024),
      inline: Boolean(field.inline)
    });
  }

  return buildEmbed(db, guild?.id, {
    title: `${theme.tag} ${payload.title || theme.title}`,
    description: payload.description ? trim(payload.description, 4096) : undefined,
    fields,
    style: payload.style || theme.style,
    color: payload.color,
    thumbnail: payload.thumbnail,
    image: payload.image
  });
}

async function systemLog(db, guild, type, payload = {}) {
  rememberLog(type, payload);
  return sendToConfiguredChannel(
    db,
    guild,
    'advanced_logs_channel',
    createLogEmbed(db, guild, type, payload)
  );
}

async function advancedLog(db, guild, options) {
  rememberLog('system', options);
  return sendToConfiguredChannel(db, guild, 'advanced_logs_channel', buildEmbed(db, guild.id, options));
}

async function restrictLog(db, guild, payload) {
  const channelId = db.getConfig(guild.id, 'restrict_logs_channel');
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send(payload).catch(() => null);
}

async function moderationLog(db, guild, caseId, type, target, moderator, reason, extra = []) {
  return systemLog(db, guild, 'moderation', {
    title: `Case #${caseId} - ${type}`,
    target,
    actor: moderator,
    fields: [
      { name: 'Reason', value: reason || 'No reason provided' },
      ...extra
    ],
    style: type.toLowerCase().includes('un') ? 'emerald' : 'ruby',
    footer: `Case #${caseId}`
  });
}

module.exports = {
  advancedLog,
  createLogEmbed,
  getRecentLogs,
  LOG_THEMES,
  restrictLog,
  moderationLog,
  systemLog
};
