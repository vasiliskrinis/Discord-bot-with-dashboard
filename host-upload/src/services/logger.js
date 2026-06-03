const { buildEmbed } = require('../embeds');

async function sendToConfiguredChannel(db, guild, key, embed) {
  const channelId = db.getConfig(guild.id, key);
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send({ embeds: [embed] }).catch(() => null);
}

async function advancedLog(db, guild, options) {
  return sendToConfiguredChannel(
    db,
    guild,
    'advanced_logs_channel',
    buildEmbed(db, guild.id, options)
  );
}

async function restrictLog(db, guild, payload) {
  const channelId = db.getConfig(guild.id, 'restrict_logs_channel');
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send(payload).catch(() => null);
}

async function moderationLog(db, guild, caseId, type, target, moderator, reason, extra = []) {
  return advancedLog(db, guild, {
    title: `Case #${caseId} - ${type}`,
    fields: [
      { name: 'Target', value: target ? `${target} (${target.id})` : 'Unknown', inline: true },
      { name: 'Moderator', value: moderator ? `${moderator} (${moderator.id})` : 'System', inline: true },
      { name: 'Reason', value: reason || 'No reason provided' },
      ...extra
    ],
    style: type.toLowerCase().includes('un') ? 'emerald' : 'ruby'
  });
}

module.exports = {
  advancedLog,
  restrictLog,
  moderationLog
};
