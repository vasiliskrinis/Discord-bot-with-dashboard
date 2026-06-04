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

function cleanText(value, fallback = 'Unknown', maxLength = 1024) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function formatDateText(value) {
  return cleanText(value, 'Unknown date', 80).replace(/\s+UTC$/i, ' UTC');
}

function compactList(items, formatter, limit = 10) {
  const rendered = items.slice(0, limit).map(formatter).filter(Boolean);
  const remaining = items.length - rendered.length;
  if (remaining > 0) rendered.push(`+${remaining} more`);
  return rendered.join('\n') || 'None';
}

function robloxUpdateEmbedOptions(title, data) {
  const platforms = ['Windows', 'Mac', 'Android', 'iOS'].filter((platform) => data?.[platform] || data?.[`${platform}Response`]);
  const fields = platforms.map((platform) => {
    const response = data?.[`${platform}Response`] || {};
    const version = data?.[platform] || response.version || response.clientVersionUpload || 'Unknown';
    const details = [
      `Version: **${cleanText(version, 'Unknown', 80)}**`,
      data?.[`${platform}Date`] ? `Updated: ${formatDateText(data[`${platform}Date`])}` : null,
      response.clientVersionUpload ? `Client: \`${cleanText(response.clientVersionUpload, 'Unknown', 80)}\`` : null,
      response.bootstrapperVersion ? `Bootstrapper: \`${cleanText(response.bootstrapperVersion, 'Unknown', 80)}\`` : null
    ].filter(Boolean);
    return {
      name: platform,
      value: details.join('\n'),
      inline: true
    };
  });

  return {
    title,
    description: 'Current Roblox client versions by platform.',
    fields,
    style: 'cyber'
  };
}

function executorStatusLine(executor) {
  const badges = [
    cleanText(executor.platform, 'Unknown', 24),
    executor.updateStatus ? 'Updated' : 'Pending',
    executor.free ? 'Free' : (executor.cost || 'Paid'),
    executor.detected ? 'Detected' : 'Undetected'
  ];
  const scores = [
    Number.isFinite(Number(executor.uncPercentage)) ? `UNC ${executor.uncPercentage}%` : null,
    Number.isFinite(Number(executor.suncPercentage)) ? `sUNC ${executor.suncPercentage}%` : null
  ].filter(Boolean).join(' / ');
  return `**${cleanText(executor.title, 'Unknown executor', 48)}** ${cleanText(executor.version, '', 36)}\n${badges.join(' • ')}${scores ? ` • ${scores}` : ''}`;
}

function executorUpdateEmbedOptions(title, data) {
  const executors = Array.isArray(data) ? data.filter((item) => item && !item.hidden) : [];
  const sorted = [...executors].sort((a, b) => {
    if (Boolean(a.updateStatus) !== Boolean(b.updateStatus)) return a.updateStatus ? -1 : 1;
    return Number(b.index || 0) - Number(a.index || 0);
  });
  const updated = sorted.filter((item) => item.updateStatus);
  const pending = sorted.filter((item) => !item.updateStatus);
  const platformCounts = executors.reduce((counts, item) => {
    const platform = cleanText(item.platform, 'Unknown', 24);
    counts[platform] = (counts[platform] || 0) + 1;
    return counts;
  }, {});

  const fields = [
    {
      name: 'Summary',
      value: [
        `Tracked: **${executors.length}**`,
        `Updated: **${updated.length}**`,
        `Pending: **${pending.length}**`,
        `Detected: **${executors.filter((item) => item.detected).length}**`
      ].join('\n'),
      inline: true
    },
    {
      name: 'Platforms',
      value: Object.entries(platformCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([platform, count]) => `${platform}: **${count}**`)
        .join('\n') || 'No platform data',
      inline: true
    },
    {
      name: 'Updated Executors',
      value: compactList(updated, executorStatusLine, 8)
    },
    {
      name: 'Pending / Not Updated',
      value: compactList(pending, executorStatusLine, 8)
    }
  ];

  const featured = sorted.find((item) => item.slug?.logo);
  return {
    title,
    description: 'Current executor compatibility summary with update, platform, detection, and UNC status.',
    thumbnail: featured?.slug?.logo || null,
    fields,
    style: 'cyber'
  };
}

function updateEmbedOptions(title, key, data) {
  if (key === 'roblox_updates_channel') return robloxUpdateEmbedOptions(title, data);
  if (key === 'executor_updates_channel') return executorUpdateEmbedOptions(title, data);
  return {
    title,
    description: cleanText(JSON.stringify(data, null, 2), 'No update data.', 3500),
    style: 'cyber'
  };
}

function clientList(clientOrClients) {
  return (Array.isArray(clientOrClients) ? clientOrClients : [clientOrClients]).filter(Boolean);
}

function uniqueGuilds(clientOrClients) {
  const guilds = new Map();
  for (const client of clientList(clientOrClients)) {
    for (const guild of client.guilds?.cache?.values?.() || []) {
      if (!guilds.has(guild.id)) guilds.set(guild.id, guild);
    }
  }
  return [...guilds.values()];
}

async function fetchGuild(clientOrClients, guildId) {
  for (const client of clientList(clientOrClients)) {
    const cached = client.guilds?.cache?.get?.(guildId);
    if (cached) return cached;
    const fetched = await client.guilds?.fetch?.(guildId).catch(() => null);
    if (fetched) return fetched;
  }
  return null;
}

async function fetchChannel(clientOrClients, channelId) {
  for (const client of clientList(clientOrClients)) {
    const cached = client.channels?.cache?.get?.(channelId);
    if (cached) return cached;
    const fetched = await client.channels?.fetch?.(channelId).catch(() => null);
    if (fetched) return fetched;
  }
  return null;
}

async function sendUpdate(db, guild, key, title, data) {
  const channelId = db.getConfig(guild.id, key);
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const pingRole = db.getConfig(guild.id, 'update_ping_role');
  await channel.send({
    content: pingRole ? `<@&${pingRole}>` : undefined,
    allowedMentions: pingRole ? { roles: [pingRole], users: [], parse: [] } : { parse: [], users: [], roles: [] },
    embeds: [buildEmbed(db, guild.id, updateEmbedOptions(title, key, data))]
  }).catch(() => null);
}

async function pollRobloxUpdates(client, db) {
  const guilds = uniqueGuilds(client);
  if (!guilds.some((guild) => db.getConfig(guild.id, 'roblox_updates_channel'))) return;
  const data = await fetchJson('https://weao.xyz/api/versions/current');
  if (!data) return;
  const snapshot = stableJson(data);
  for (const guild of guilds) {
    if (!db.getConfig(guild.id, 'roblox_updates_channel')) continue;
    const previous = db.getState(guild.id, 'roblox_versions_snapshot');
    if (!previous) {
      db.setState(guild.id, 'roblox_versions_snapshot', snapshot);
      await sendUpdate(db, guild, 'roblox_updates_channel', 'Roblox Update Snapshot', data);
      continue;
    }
    if (previous !== snapshot) {
      db.setState(guild.id, 'roblox_versions_snapshot', snapshot);
      await sendUpdate(db, guild, 'roblox_updates_channel', 'Roblox Update', data);
    }
  }
}

async function pollExecutorUpdates(client, db) {
  const guilds = uniqueGuilds(client);
  if (!guilds.some((guild) => db.getConfig(guild.id, 'executor_updates_channel'))) return;
  const data = await fetchJson('https://weao.xyz/api/status/exploits');
  if (!data) return;
  const snapshot = stableJson(data);
  for (const guild of guilds) {
    if (!db.getConfig(guild.id, 'executor_updates_channel')) continue;
    const previous = db.getState(guild.id, 'executor_status_snapshot');
    if (!previous) {
      db.setState(guild.id, 'executor_status_snapshot', snapshot);
      await sendUpdate(db, guild, 'executor_updates_channel', 'Executor Update Snapshot', data);
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
    const channel = await fetchChannel(client, reminder.channel_id);
    if (channel?.isTextBased()) {
      await channel.send(`<@${reminder.user_id}> reminder: ${reminder.message}`).catch(() => null);
    }
    db.deleteReminder(reminder.rowid);
  }
}

async function runDueTempRoles(client, db) {
  for (const temp of db.dueTempRoles()) {
    const guild = await fetchGuild(client, temp.guild_id);
    const member = await guild?.members.fetch(temp.user_id).catch(() => null);
    if (member) {
      await member.roles.remove(temp.role_id, 'Temporary role expired').catch(() => null);
    }
    db.removeTempRole(temp.guild_id, temp.user_id, temp.role_id);
  }
}

async function runDueGiveaways(client, db) {
  for (const giveaway of db.dueGiveaways()) {
    const channel = await fetchChannel(client, giveaway.channel_id);
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
