const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { ActivityType, ChannelType, PermissionsBitField } = require('discord.js');
const env = require('../env');
const { DEFAULT_GUILD_CONFIG } = require('../db');
const { EMBED_STYLES, buildEmbed } = require('../embeds');

const SESSION_COOKIE = 'bot_dashboard_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const STATIC_FILES = new Set(['app.js', 'index.html', 'styles.css']);

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

const CHANNEL_CONFIG_KEYS = new Set([
  'restrict_channel',
  'advanced_logs_channel',
  'restrict_logs_channel',
  'restricted_users_channel',
  'roblox_updates_channel',
  'executor_updates_channel',
  'counting_channel',
  'welcome_channel',
  'level_announce_channel',
  'member_count_voice'
]);

const ROLE_CONFIG_KEYS = new Set([
  'restrict_perms_role',
  'restricted_role',
  'update_ping_role',
  'auto_role'
]);

const ROLE_LIST_CONFIG_KEYS = new Set(['admin_roles', 'authorized_roles']);
const USER_LIST_CONFIG_KEYS = new Set(['admin_users']);
const BOOLEAN_CONFIG_KEYS = new Set([
  'ai_moderation_enabled',
  'anti_raid_enabled',
  'bot_add_guard_enabled',
  'economy_enabled',
  'achievements_enabled',
  'leveling_enabled'
]);
const NUMBER_CONFIG_KEYS = new Set([
  'anti_raid_join_limit',
  'anti_raid_window_seconds',
  'xp_per_message_min',
  'xp_per_message_max'
]);
const EMBED_STYLE_KEYS = new Set(Object.keys(EMBED_STYLES));

const CONFIG_LABELS = {
  restrict_perms_role: 'Restrict perms role',
  restricted_role: 'Restricted role',
  restrict_channel: 'Restrict trap channel',
  advanced_logs_channel: 'Advanced logs channel',
  restrict_logs_channel: 'Restrict logs channel',
  restricted_users_channel: 'Restricted users channel',
  roblox_updates_channel: 'Roblox updates channel',
  executor_updates_channel: 'Executor updates channel',
  update_ping_role: 'Update ping role',
  auto_role: 'Auto role',
  counting_channel: 'Counting channel',
  welcome_channel: 'Welcome channel',
  welcome_message: 'Welcome message',
  level_announce_channel: 'Level announcements channel',
  member_count_voice: 'Member count voice channel',
  embed_style: 'Embed style',
  admin_users: 'Admin users',
  admin_roles: 'Admin roles',
  authorized_roles: 'Restrict review roles',
  ai_moderation_enabled: 'AI moderation enabled',
  anti_raid_enabled: 'Anti-raid enabled',
  anti_raid_join_limit: 'Anti-raid join limit',
  anti_raid_window_seconds: 'Anti-raid window seconds',
  anti_raid_action: 'Anti-raid action',
  bot_add_guard_enabled: 'Bot add guard enabled',
  economy_enabled: 'Economy enabled',
  achievements_enabled: 'Achievements enabled',
  leveling_enabled: 'Leveling enabled',
  xp_per_message_min: 'XP per message min',
  xp_per_message_max: 'XP per message max',
  role_level_rewards: 'Role-level rewards',
  sticky: 'Sticky message'
};

const CRITICAL_CONFIG_KEYS = [
  'restricted_role',
  'restrict_logs_channel',
  'advanced_logs_channel',
  'restricted_users_channel'
];

function startDashboard({ client, db }) {
  if (!env.dashboardEnabled) return null;

  const staticRoot = path.join(__dirname, 'public');
  const sessions = new Map();
  const passwordRequired = Boolean(env.dashboardPassword);

  if (!passwordRequired && !isLoopbackHost(env.dashboardHost)) {
    console.warn('Dashboard disabled: set DASHBOARD_PASSWORD before binding the dashboard to a non-local host.');
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest({ req, res, client, db, staticRoot, sessions, passwordRequired });
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) console.error('Dashboard request failed:', err);
      sendJson(res, status, { error: err.message || 'Dashboard request failed.' });
    }
  });

  server.on('error', (err) => {
    console.error(`Dashboard failed to start: ${err.message}`);
  });

  server.listen(env.dashboardPort, env.dashboardHost, () => {
    const address = server.address();
    const host = address?.address && address.address !== '::' ? address.address : env.dashboardHost;
    const port = address?.port || env.dashboardPort;
    console.log(`Dashboard available at http://${formatHost(host)}:${port}`);
  });

  return server;
}

async function handleRequest(context) {
  const { req, res, client, db, staticRoot, sessions, passwordRequired } = context;
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = normalizeDashboardPath(requestUrl.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, securityHeaders());
    res.end();
    return;
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    sendJson(res, 200, {
      authenticated: isAuthenticated(req, sessions, passwordRequired),
      passwordRequired,
      localOnly: !passwordRequired,
      bot: botSummary(client)
    });
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (!passwordRequired) {
      sendJson(res, 200, { authenticated: true });
      return;
    }
    if (!safeEqual(String(body.password || ''), env.dashboardPassword)) {
      throw httpError(401, 'Invalid dashboard password.');
    }
    pruneSessions(sessions);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    sendJson(res, 200, { authenticated: true }, {
      'Set-Cookie': cookieHeader(token)
    });
    return;
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = cookieValue(req, SESSION_COOKIE);
    if (token) sessions.delete(token);
    sendJson(res, 200, { authenticated: false }, {
      'Set-Cookie': cookieHeader('', 0)
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated(req, sessions, passwordRequired)) {
      throw httpError(401, 'Dashboard login required.');
    }

    if (pathname === '/api/overview' && req.method === 'GET') {
      sendJson(res, 200, overviewPayload(client, db));
      return;
    }

    if (pathname === '/api/runtime' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, updateRuntimeFlag(client, db, body));
      return;
    }

    if (pathname === '/api/presence' && req.method === 'POST') {
      const body = await readJsonBody(req);
      await updatePresence(client, body);
      sendJson(res, 200, { bot: botSummary(client) });
      return;
    }

    if (pathname === '/api/owner/broadcast' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await sendOwnerBroadcast(client, db, body));
      return;
    }

    if (pathname === '/api/owner/blacklist' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, updateBotBan(client, db, body));
      return;
    }

    if (pathname === '/api/owner/backup' && req.method === 'POST') {
      sendJson(res, 200, createDashboardBackup(db));
      return;
    }

    const guildActionMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/action$/);
    if (guildActionMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildActionMatch[1]);
      sendJson(res, 200, await runGuildAction(client, db, guildId, body));
      return;
    }

    const guildLeaveMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/leave$/);
    if (guildLeaveMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildLeaveMatch[1]);
      sendJson(res, 200, await leaveGuildFromDashboard(client, db, guildId, body));
      return;
    }

    const guildConfigMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/config$/);
    if (guildConfigMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildConfigMatch[1]);
      updateGuildConfig(client, db, guildId, body);
      sendJson(res, 200, guildDetailPayload(client, db, guildId));
      return;
    }

    const guildMatch = pathname.match(/^\/api\/guilds\/([^/]+)$/);
    if (guildMatch && req.method === 'GET') {
      sendJson(res, 200, guildDetailPayload(client, db, decodeURIComponent(guildMatch[1])));
      return;
    }

    throw httpError(404, 'Dashboard API route not found.');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw httpError(405, 'Method not allowed.');
  }

  serveStatic(res, staticRoot, pathname, req.method === 'HEAD');
}

function overviewPayload(client, db) {
  const errors = [];
  const stats = safePayloadSection(errors, 'database stats', { filePath: db.filePath || null, tables: {} }, () => db.databaseStats());
  const guilds = safePayloadSection(errors, 'servers', [], () => (
    getGuilds(client).map((guild) => safeGuildSummary(guild, db, errors))
  ));
  const tables = stats.tables || {};
  return {
    generatedAt: Date.now(),
    bot: botSummary(client),
    runtime: safePayloadSection(errors, 'runtime flags', defaultRuntimeFlags(), () => db.runtimeFlags()),
    guilds,
    totals: {
      guilds: guilds.length,
      members: guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0),
      channels: guilds.reduce((sum, guild) => sum + (guild.channelCount || 0), 0),
      roles: guilds.reduce((sum, guild) => sum + (guild.roleCount || 0), 0)
    },
    database: {
      filePath: stats.filePath,
      tables,
      totalRows: Object.values(tables).reduce((sum, count) => sum + count, 0)
    },
    owner: safePayloadSection(errors, 'owner controls', {}, () => ownerPayload(db, guilds, tables)),
    commandUsage: safePayloadSection(errors, 'command usage', [], () => db.listCommandUsage(12)),
    botBans: safePayloadSection(errors, 'watchlist', [], () => db.listBotBans(null, 10)),
    errors
  };
}

function guildDetailPayload(client, db, guildId) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const errors = [];
  const config = safePayloadSection(errors, 'server settings', { ...DEFAULT_GUILD_CONFIG }, () => {
    db.ensureGuildConfig(guild.id);
    return db.getAllConfig(guild.id);
  });

  return {
    generatedAt: Date.now(),
    guild: safeGuildSummary(guild, db, errors),
    config: Object.keys({ ...DEFAULT_GUILD_CONFIG, ...config }).sort().map((key) => ({
      key,
      label: CONFIG_LABELS[key] || titleize(key),
      value: config[key],
      display: displayConfigValue(client, guild, key, config[key]),
      empty: isEmptyConfigValue(config[key]),
      editable: Object.prototype.hasOwnProperty.call(DEFAULT_GUILD_CONFIG, key),
      type: configInputType(key),
      picker: configPickerType(key),
      multiple: ROLE_LIST_CONFIG_KEYS.has(key) || USER_LIST_CONFIG_KEYS.has(key),
      critical: CRITICAL_CONFIG_KEYS.includes(key)
    })),
    options: guildPickerOptions(client, guild),
    activeRestrictions: safePayloadSection(errors, 'active restrictions', [], () => db.listActiveRestrictions(guild.id, 20)).map((row) => ({
      userId: row.user_id,
      userLabel: userLabel(client, guild, row.user_id),
      restrictedBy: row.restricted_by,
      reason: row.reason,
      source: row.source,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      originalRoleCount: row.original_roles.length
    })),
    recentCases: safePayloadSection(errors, 'recent cases', [], () => db.listCases(guild.id, null, 12)).map((row) => ({
      caseId: row.case_id,
      type: row.type,
      targetId: row.target_id,
      targetLabel: row.target_id ? userLabel(client, guild, row.target_id) : 'No target',
      moderatorId: row.moderator_id,
      moderatorLabel: row.moderator_id ? userLabel(client, guild, row.moderator_id) : 'Unknown',
      reason: row.reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    ticketPanels: safePayloadSection(errors, 'ticket panels', [], () => db.listTicketPanels(guild.id)).map((row) => ({
      panelId: row.panel_id,
      name: row.name,
      description: row.description,
      category: row.category_id ? channelLabel(guild, row.category_id) : 'No category',
      supportRole: row.support_role_id ? roleLabel(guild, row.support_role_id) : 'No role',
      createdAt: row.created_at
    })),
    tickets: safePayloadSection(errors, 'tickets', [], () => db.listTickets(guild.id, null, 20)).map((row) => ({
      panelId: row.panel_id,
      userId: row.user_id,
      userLabel: userLabel(client, guild, row.user_id),
      channelId: row.channel_id,
      channelLabel: channelLabel(guild, row.channel_id),
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at
    })),
    reminders: safePayloadSection(errors, 'reminders', [], () => db.listReminders(guild.id, 10)).map((row) => ({
      userId: row.user_id,
      userLabel: userLabel(client, guild, row.user_id),
      channelLabel: channelLabel(guild, row.channel_id),
      message: row.message,
      dueAt: row.due_at,
      createdAt: row.created_at
    })),
    giveaways: safePayloadSection(errors, 'giveaways', [], () => db.listGiveaways(guild.id, 10)).map((row) => ({
      giveawayId: row.giveaway_id,
      channelLabel: channelLabel(guild, row.channel_id),
      prize: row.prize,
      winnerCount: row.winner_count,
      endsAt: row.ends_at,
      ended: Boolean(row.ended)
    })),
    progression: {
      topXp: safePayloadSection(errors, 'XP leaderboard', [], () => db.listProgressLeaderboard(guild.id, 'xp', 5)).map((row) => ({
        userId: row.user_id,
        userLabel: userLabel(client, guild, row.user_id),
        level: row.level,
        xp: row.xp,
        balance: row.balance,
        messages: row.messages
      })),
      topBalance: safePayloadSection(errors, 'coin leaderboard', [], () => db.listProgressLeaderboard(guild.id, 'balance', 5)).map((row) => ({
        userId: row.user_id,
        userLabel: userLabel(client, guild, row.user_id),
        level: row.level,
        xp: row.xp,
        balance: row.balance,
        messages: row.messages
      }))
    },
    aiPrompts: safePayloadSection(errors, 'AI prompts', [], () => db.listActiveAiPrompts('guild', guild.id, 10)),
    state: {
      countingNumber: safePayloadSection(errors, 'counting state', 0, () => db.getState(guild.id, 'counting_number', 0)),
      countingLastUser: safePayloadSection(errors, 'counting user state', null, () => db.getState(guild.id, 'counting_last_user', null)),
      robloxSnapshotSaved: Boolean(safePayloadSection(errors, 'Roblox watcher state', null, () => db.getState(guild.id, 'roblox_versions_snapshot', null))),
      executorSnapshotSaved: Boolean(safePayloadSection(errors, 'executor watcher state', null, () => db.getState(guild.id, 'executor_status_snapshot', null)))
    },
    errors
  };
}

function safePayloadSection(errors, section, fallback, producer) {
  try {
    return producer();
  } catch (err) {
    console.error(`Dashboard ${section} failed:`, err);
    errors.push({
      section,
      message: err.message || `${titleize(section)} failed.`
    });
    return fallback;
  }
}

function safeGuildSummary(guild, db, errors) {
  try {
    return guildSummary(guild, db);
  } catch (err) {
    console.error(`Dashboard server summary failed for ${guild?.id || 'unknown guild'}:`, err);
    errors.push({
      section: guild?.name ? `server ${guild.name}` : 'server summary',
      message: err.message || 'Server summary failed.'
    });
    return fallbackGuildSummary(guild, err);
  }
}

function fallbackGuildSummary(guild, err) {
  return {
    id: guild?.id || 'unknown',
    name: guild?.name || 'Unknown server',
    iconUrl: guild?.iconURL?.({ size: 128 }) || null,
    ownerId: guild?.ownerId || null,
    memberCount: Number(guild?.memberCount || 0),
    channelCount: collectionSize(guild?.channels?.cache),
    roleCount: collectionSize(guild?.roles?.cache),
    configuredCritical: 0,
    missingCritical: [],
    embedStyle: DEFAULT_GUILD_CONFIG.embed_style,
    locale: guild?.preferredLocale || null,
    createdAt: guild?.createdTimestamp || null,
    error: err.message || 'Server settings could not be loaded.'
  };
}

function defaultRuntimeFlags() {
  return {
    maintenance: false,
    panicMode: false,
    aiLocked: false,
    botLocked: false
  };
}

function ownerPayload(db, guilds, tables) {
  return {
    botOwnerId: env.botOwnerId || null,
    locked: db.runtimeFlags(),
    health: {
      configuredServers: guilds.filter((guild) => guild.missingCritical?.length === 0).length,
      needsSetup: guilds.filter((guild) => guild.missingCritical?.length > 0).length,
      activeRestrictions: Number(tables.restrictions || 0),
      cases: Number(tables.cases || 0),
      tickets: Number(tables.tickets || 0),
      trackedMembers: Number(tables.member_progress || 0),
      achievements: Number(tables.member_achievements || 0)
    }
  };
}

function configInputType(key) {
  if (CHANNEL_CONFIG_KEYS.has(key)) return 'channel';
  if (ROLE_CONFIG_KEYS.has(key)) return 'role';
  if (ROLE_LIST_CONFIG_KEYS.has(key)) return 'role-list';
  if (USER_LIST_CONFIG_KEYS.has(key)) return 'user-list';
  if (BOOLEAN_CONFIG_KEYS.has(key)) return 'boolean';
  if (NUMBER_CONFIG_KEYS.has(key)) return 'number';
  if (key === 'embed_style') return 'style';
  if (key === 'sticky' || key === 'role_level_rewards') return 'json';
  if (key === 'welcome_message') return 'message';
  return 'text';
}

function configPickerType(key) {
  if (CHANNEL_CONFIG_KEYS.has(key)) return key === 'member_count_voice' ? 'voiceChannels' : 'textChannels';
  if (ROLE_CONFIG_KEYS.has(key) || ROLE_LIST_CONFIG_KEYS.has(key)) return 'roles';
  if (USER_LIST_CONFIG_KEYS.has(key)) return 'users';
  if (key === 'embed_style') return 'styles';
  return null;
}

function guildPickerOptions(client, guild) {
  return {
    roles: [...(guild.roles?.cache?.values?.() || [])]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
      .map((role) => ({
        id: role.id,
        label: role.name,
        detail: `${role.members?.size || 0} members`,
        color: role.hexColor && role.hexColor !== '#000000' ? role.hexColor : null,
        managed: Boolean(role.managed)
      })),
    textChannels: channelOptions(guild, (channel) => channel?.isTextBased?.()),
    voiceChannels: channelOptions(guild, (channel) => channel.type === ChannelType.GuildVoice),
    users: [...(guild.members?.cache?.values?.() || [])]
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b)))
      .slice(0, 250)
      .map((member) => ({
        id: member.id,
        label: memberLabel(member),
        detail: member.user?.tag || member.id,
        avatarUrl: member.user?.displayAvatarURL?.({ size: 64 }) || null
      })),
    styles: Object.entries(EMBED_STYLES).map(([id, style]) => ({
      id,
      label: style.name,
      detail: id,
      color: `#${style.color.toString(16).padStart(6, '0')}`
    }))
  };
}

function channelOptions(guild, predicate) {
  return [...(guild.channels?.cache?.values?.() || [])]
    .filter(predicate)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0) || a.name.localeCompare(b.name))
    .map((channel) => ({
      id: channel.id,
      label: channel.name,
      detail: channelTypeLabel(channel.type),
      parentId: channel.parentId || null
    }));
}

function channelTypeLabel(type) {
  const labels = {
    [ChannelType.GuildText]: 'Text',
    [ChannelType.GuildVoice]: 'Voice',
    [ChannelType.GuildAnnouncement]: 'Announcement',
    [ChannelType.GuildForum]: 'Forum',
    [ChannelType.GuildStageVoice]: 'Stage'
  };
  return labels[type] || 'Channel';
}

function memberLabel(member) {
  return member?.displayName || member?.user?.tag || member?.id || 'Unknown user';
}

async function sendOwnerBroadcast(client, db, body) {
  const target = String(body.target || '').trim();
  const text = String(body.message || '').trim();
  if (!target) throw httpError(400, 'Broadcast target is required.');
  if (!text) throw httpError(400, 'Broadcast message is required.');
  if (text.length > 3900) throw httpError(400, 'Broadcast message is too long.');

  const guilds = target === 'all'
    ? getGuilds(client)
    : [getGuild(client, target)].filter(Boolean);
  if (!guilds.length) throw httpError(404, 'No matching server found.');

  let sent = 0;
  const failures = [];
  for (const guild of guilds) {
    const channel = findBroadcastChannel(db, guild);
    if (!channel) {
      failures.push({ guildId: guild.id, guildName: guild.name, reason: 'No writable channel' });
      continue;
    }
    await channel.send({
      embeds: [buildEmbed(db, guild.id, { title: 'Broadcast', description: text, style: 'royal' })]
    }).then(() => {
      sent += 1;
    }).catch((err) => {
      failures.push({ guildId: guild.id, guildName: guild.name, reason: err.message || 'Send failed' });
    });
  }

  return {
    sent,
    total: guilds.length,
    failures,
    commandUsage: db.listCommandUsage(12)
  };
}

function findBroadcastChannel(db, guild) {
  const configuredIds = [
    db.getConfig(guild.id, 'advanced_logs_channel'),
    db.getConfig(guild.id, 'welcome_channel'),
    db.getConfig(guild.id, 'restrict_logs_channel')
  ].filter(Boolean);

  const candidates = [
    guild.systemChannel,
    ...configuredIds.map((id) => guild.channels?.cache?.get?.(id)),
    ...(guild.channels?.cache?.values?.() || [])
  ].filter(Boolean);

  return candidates.find((channel) => {
    if (!channel?.isTextBased?.()) return false;
    const permissions = channel.permissionsFor?.(guild.members?.me);
    return permissions?.has?.(PermissionsBitField.Flags.SendMessages);
  }) || null;
}

function updateBotBan(client, db, body) {
  const action = String(body.action || 'add').trim().toLowerCase();
  const kindRaw = String(body.kind || '').trim().toLowerCase();
  const kind = kindRaw.startsWith('guild') || kindRaw === 'server'
    ? 'guild'
    : kindRaw.startsWith('user') || kindRaw === 'member'
      ? 'member'
      : null;
  const id = String(body.id || '').trim().replace(/[<@!>]/g, '');
  const reason = String(body.reason || 'Updated from dashboard').trim();

  if (!['add', 'remove'].includes(action)) throw httpError(400, 'Invalid blacklist action.');
  if (!kind || !id) throw httpError(400, 'Blacklist kind and ID are required.');
  if (kind === 'member' && action === 'add' && env.botOwnerId && id === env.botOwnerId) {
    throw httpError(400, 'The protected bot owner can not be blacklisted.');
  }

  if (action === 'add') db.addBotBan(kind, id, reason || 'Updated from dashboard');
  else db.removeBotBan(kind, id);

  const guild = kind === 'guild' ? getGuild(client, id) : null;
  if (action === 'add' && guild) guild.leave().catch(() => null);

  return {
    botBans: db.listBotBans(null, 25),
    action,
    kind,
    id
  };
}

function createDashboardBackup(db) {
  const backupPath = db.backupTo(path.join('data', 'backups', `bot-${timestampName()}.sqlite`));
  const stats = db.databaseStats();
  return {
    filePath: backupPath,
    database: {
      ...stats,
      totalRows: Object.values(stats.tables).reduce((sum, count) => sum + count, 0)
    }
  };
}

async function runGuildAction(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'lockdown' || action === 'unlockdown') {
    const deny = action === 'lockdown' ? false : null;
    let count = 0;
    for (const channel of guild.channels?.cache?.values?.() || []) {
      if (channel.type !== ChannelType.GuildText) continue;
      await channel.permissionOverwrites.edit(guild.id, { SendMessages: deny })
        .then(() => { count += 1; })
        .catch(() => null);
    }
    return {
      action,
      updatedChannels: count,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  throw httpError(400, 'Unknown server action.');
}

async function leaveGuildFromDashboard(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const confirm = String(body.confirm || '').trim();
  if (confirm !== guild.id) {
    throw httpError(400, 'Type the exact server ID to confirm leaving.');
  }

  const left = { id: guild.id, name: guild.name };
  await guild.leave();
  return {
    left,
    overview: overviewPayload(client, db)
  };
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function updateRuntimeFlag(client, db, body) {
  const flag = String(body.flag || '').trim();
  const enabled = Boolean(body.enabled);

  if (flag === 'panicMode') {
    db.setGlobalState('panic_mode', enabled);
    db.setGlobalState('maintenance', enabled);
    db.setGlobalState('bot_locked', enabled);
    db.setGlobalState('ai_locked', enabled);
  } else if (flag === 'maintenance') {
    db.setGlobalState('maintenance', enabled);
  } else if (flag === 'botLocked') {
    db.setGlobalState('bot_locked', enabled);
  } else if (flag === 'aiLocked') {
    db.setGlobalState('ai_locked', enabled);
  } else {
    throw httpError(400, 'Unknown runtime flag.');
  }

  return {
    runtime: db.runtimeFlags(),
    bot: botSummary(client)
  };
}

async function updatePresence(client, body) {
  const status = String(body.status || '').trim().toLowerCase();
  const activityType = String(body.activityType || 'playing').trim().toLowerCase();
  const activityText = String(body.activityText || '').trim();

  if (status) {
    if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) {
      throw httpError(400, 'Invalid bot status.');
    }
    await client.user?.setStatus?.(status);
  }

  if (activityText) {
    await client.user?.setActivity?.(activityText.slice(0, 128), {
      type: ACTIVITY_TYPES[activityType] ?? ActivityType.Playing
    });
  }
}

function updateGuildConfig(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');

  const key = String(body.key || '').trim();
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_GUILD_CONFIG, key)) {
    throw httpError(400, 'Unknown config key.');
  }

  db.setConfig(guildId, key, normalizeConfigValue(key, body.value));
}

function normalizeConfigValue(key, value) {
  if (USER_LIST_CONFIG_KEYS.has(key) || ROLE_LIST_CONFIG_KEYS.has(key)) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (key === 'embed_style') {
    const style = String(value || '').trim().toLowerCase();
    return EMBED_STYLE_KEYS.has(style) ? style : DEFAULT_GUILD_CONFIG.embed_style;
  }

  if (key === 'welcome_message') {
    return String(value || DEFAULT_GUILD_CONFIG.welcome_message).slice(0, 1000);
  }

  if (BOOLEAN_CONFIG_KEYS.has(key)) {
    if (typeof value === 'boolean') return value;
    const lowered = String(value || '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled', 'enable'].includes(lowered)) return true;
    if (['0', 'false', 'no', 'off', 'disabled', 'disable'].includes(lowered)) return false;
    return Boolean(DEFAULT_GUILD_CONFIG[key]);
  }

  if (NUMBER_CONFIG_KEYS.has(key)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_GUILD_CONFIG[key];
  }

  if (key === 'anti_raid_action') {
    const action = String(value || DEFAULT_GUILD_CONFIG.anti_raid_action).trim().toLowerCase();
    return ['restrict', 'kick', 'timeout', 'log'].includes(action) ? action : DEFAULT_GUILD_CONFIG.anti_raid_action;
  }

  if (key === 'sticky' || key === 'role_level_rewards') {
    if (key === 'role_level_rewards' && !value) return [];
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      throw httpError(400, `${CONFIG_LABELS[key] || key} must be valid JSON.`);
    }
  }

  const text = String(value || '').trim();
  return text || DEFAULT_GUILD_CONFIG[key] || null;
}

function botSummary(client) {
  const user = client.user;
  const activity = user?.presence?.activities?.[0] || null;
  return {
    id: user?.id || null,
    tag: user?.tag || 'Discord Bot',
    avatarUrl: user?.displayAvatarURL?.({ size: 128 }) || null,
    status: user?.presence?.status || 'unknown',
    activityType: activity ? activityTypeName(activity.type) : null,
    activityText: activity?.name || '',
    uptimeMs: Number(client.uptime || 0),
    readyAt: client.readyAt?.getTime?.() || null,
    ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : null
  };
}

function activityTypeName(type) {
  const match = Object.entries(ACTIVITY_TYPES).find(([, value]) => value === type);
  return match?.[0] || 'playing';
}

function guildSummary(guild, db) {
  db.ensureGuildConfig(guild.id);
  const config = db.getAllConfig(guild.id);
  const missingCritical = CRITICAL_CONFIG_KEYS.filter((key) => isEmptyConfigValue(config[key]));

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL?.({ size: 128 }) || null,
    ownerId: guild.ownerId || null,
    memberCount: Number(guild.memberCount || 0),
    channelCount: collectionSize(guild.channels?.cache),
    roleCount: collectionSize(guild.roles?.cache),
    configuredCritical: CRITICAL_CONFIG_KEYS.length - missingCritical.length,
    missingCritical,
    embedStyle: config.embed_style || DEFAULT_GUILD_CONFIG.embed_style,
    locale: guild.preferredLocale || null,
    createdAt: guild.createdTimestamp || null
  };
}

function getGuilds(client) {
  return [...(client.guilds?.cache?.values?.() || [])].sort((a, b) => a.name.localeCompare(b.name));
}

function getGuild(client, guildId) {
  return client.guilds?.cache?.get?.(guildId) || null;
}

function collectionSize(collection) {
  return Number(collection?.size || 0);
}

function displayConfigValue(client, guild, key, value) {
  if (isEmptyConfigValue(value)) return 'Not set';
  if (CHANNEL_CONFIG_KEYS.has(key)) return channelLabel(guild, value);
  if (ROLE_CONFIG_KEYS.has(key)) return roleLabel(guild, value);
  if (ROLE_LIST_CONFIG_KEYS.has(key)) return listConfigValues(value).map((id) => roleLabel(guild, id)).join(', ');
  if (USER_LIST_CONFIG_KEYS.has(key)) return listConfigValues(value).map((id) => userLabel(client, guild, id)).join(', ');
  if (key === 'sticky') {
    return value?.channelId ? `${channelLabel(guild, value.channelId)} - ${value.message || 'Sticky message'}` : JSON.stringify(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function listConfigValues(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function channelLabel(guild, id) {
  const channel = guild.channels?.cache?.get?.(String(id));
  return channel?.name ? `#${channel.name}` : String(id);
}

function roleLabel(guild, id) {
  const role = guild.roles?.cache?.get?.(String(id));
  return role?.name ? `@${role.name}` : String(id);
}

function userLabel(client, guild, id) {
  const member = guild.members?.cache?.get?.(String(id));
  const user = member?.user || client.users?.cache?.get?.(String(id));
  return user?.tag || member?.displayName || String(id);
}

function isEmptyConfigValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function titleize(key) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isAuthenticated(req, sessions, passwordRequired) {
  if (!passwordRequired) return isLoopbackAddress(req.socket.remoteAddress);
  pruneSessions(sessions);
  const token = cookieValue(req, SESSION_COOKIE);
  const expiresAt = token ? sessions.get(token) : null;
  return Boolean(expiresAt && expiresAt > Date.now());
}

function pruneSessions(sessions) {
  const current = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= current) sessions.delete(token);
  }
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function cookieHeader(value, maxAge = SESSION_TTL_MS / 1000) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.floor(maxAge)}; HttpOnly; SameSite=Lax`;
}

function isLoopbackHost(host) {
  const normalized = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || isLoopbackAddress(normalized);
}

function isLoopbackAddress(address) {
  const normalized = String(address || '').replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function formatHost(host) {
  return String(host).includes(':') && !String(host).startsWith('[') ? `[${host}]` : host;
}

function normalizeDashboardPath(pathname) {
  const normalized = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  const segments = normalized.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  if (apiIndex > 0) return `/${segments.slice(apiIndex).join('/')}`;

  const staticIndex = segments.findIndex((segment) => STATIC_FILES.has(segment));
  if (staticIndex > 0) return `/${segments.slice(staticIndex).join('/')}`;

  return normalized;
}

async function readJsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw httpError(413, 'Request body is too large.');
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, 'Request body must be valid JSON.');
  }
}

function serveStatic(res, staticRoot, pathname, headOnly = false) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const requested = path.resolve(staticRoot, `.${decodeURIComponent(safePath)}`);
  const relative = path.relative(staticRoot, requested);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw httpError(403, 'Forbidden.');
  }

  const filePath = fs.existsSync(requested) && fs.statSync(requested).isFile()
    ? requested
    : path.join(staticRoot, 'index.html');
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);

  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': body.length
  });
  if (!headOnly) res.end(body);
  else res.end();
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...securityHeaders(),
    ...extraHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  };
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  startDashboard
};
