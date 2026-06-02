const { ChannelType } = require('discord.js');
const { buildEmbed } = require('../embeds');

const UPDATE_POLL_MS = 5 * 60 * 1000;

async function fetchJson(url) {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function stableJson(data) {
  if (!data || typeof data !== 'object') return JSON.stringify(data);
  if (Array.isArray(data)) return `[${data.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.keys(data)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(data[key])}`)
    .join(',')}}`;
}

async function sendUpdate(db, guild, key, title, data) {
  const channelId = db.getConfig(guild.id, key);
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const pingRole = db.getConfig(guild.id, 'update_ping_role');
  await channel.send({
    content: pingRole ? `<@&${pingRole}>` : undefined,
    embeds: [
      buildEmbed(db, guild.id, {
        title,
        description: `\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 3500)}\n\`\`\``,
        style: 'cyber'
      })
    ]
  }).catch(() => null);
}

async function pollRobloxUpdates(client, db) {
  if (!client.guilds.cache.some((guild) => db.getConfig(guild.id, 'roblox_updates_channel'))) return;
  const data = await fetchJson('https://weao.xyz/api/versions/current');
  if (!data) return;
  const snapshot = stableJson(data);
  for (const guild of client.guilds.cache.values()) {
    if (!db.getConfig(guild.id, 'roblox_updates_channel')) continue;
    const previous = db.getState(guild.id, 'roblox_versions_snapshot');
    if (!previous) {
      db.setState(guild.id, 'roblox_versions_snapshot', snapshot);
      continue;
    }
    if (previous !== snapshot) {
      db.setState(guild.id, 'roblox_versions_snapshot', snapshot);
      await sendUpdate(db, guild, 'roblox_updates_channel', 'Roblox Update', data);
    }
  }
}

async function pollExecutorUpdates(client, db) {
  if (!client.guilds.cache.some((guild) => db.getConfig(guild.id, 'executor_updates_channel'))) return;
  const data = await fetchJson('https://weao.xyz/api/status/exploits');
  if (!data) return;
  const snapshot = stableJson(data);
  for (const guild of client.guilds.cache.values()) {
    if (!db.getConfig(guild.id, 'executor_updates_channel')) continue;
    const previous = db.getState(guild.id, 'executor_status_snapshot');
    if (!previous) {
      db.setState(guild.id, 'executor_status_snapshot', snapshot);
      continue;
    }
    if (previous !== snapshot) {
      db.setState(guild.id, 'executor_status_snapshot', snapshot);
      await sendUpdate(db, guild, 'executor_updates_channel', 'Executor Update', data);
    }
  }
}

async function updateMemberCountChannel(db, guild) {
  const channelId = db.getConfig(guild.id, 'member_count_voice');
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  await channel.setName(`Members: ${guild.memberCount}`).catch(() => null);
}

async function runDueReminders(client, db) {
  for (const reminder of db.dueReminders()) {
    const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send(`<@${reminder.user_id}> reminder: ${reminder.message}`).catch(() => null);
    }
    db.deleteReminder(reminder.rowid);
  }
}

async function runDueTempRoles(client, db) {
  for (const temp of db.dueTempRoles()) {
    const guild = await client.guilds.fetch(temp.guild_id).catch(() => null);
    const member = await guild?.members.fetch(temp.user_id).catch(() => null);
    if (member) {
      await member.roles.remove(temp.role_id, 'Temporary role expired').catch(() => null);
    }
    db.removeTempRole(temp.guild_id, temp.user_id, temp.role_id);
  }
}

async function runDueGiveaways(client, db) {
  for (const giveaway of db.dueGiveaways()) {
    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send(`Giveaway ended for **${giveaway.prize}**. Reroll with \`/giveaway reroll ${giveaway.giveaway_id}\`.`).catch(() => null);
    }
    db.endGiveaway(giveaway.guild_id, giveaway.giveaway_id);
  }
}

function startWatchers(client, db, restrictions) {
  setInterval(() => pollRobloxUpdates(client, db), UPDATE_POLL_MS).unref();
  setInterval(() => pollExecutorUpdates(client, db), UPDATE_POLL_MS).unref();
  setInterval(() => restrictions.expireDueRestrictions(db, client), 60 * 1000).unref();
  setInterval(() => runDueReminders(client, db), 30 * 1000).unref();
  setInterval(() => runDueTempRoles(client, db), 30 * 1000).unref();
  setInterval(() => runDueGiveaways(client, db), 30 * 1000).unref();

  pollRobloxUpdates(client, db).catch(() => null);
  pollExecutorUpdates(client, db).catch(() => null);
}

module.exports = {
  startWatchers,
  updateMemberCountChannel,
  pollRobloxUpdates,
  pollExecutorUpdates
};
