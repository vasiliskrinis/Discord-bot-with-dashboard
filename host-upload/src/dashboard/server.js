const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { ActivityType } = require('discord.js');
const env = require('../env');
const { DEFAULT_GUILD_CONFIG } = require('../db');

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
  'member_count_voice'
]);

const ROLE_CONFIG_KEYS = new Set([
  'restrict_perms_role',
  'restricted_role',
  'update_ping_role'
]);

const ROLE_LIST_CONFIG_KEYS = new Set(['admin_roles', 'authorized_roles']);
const USER_LIST_CONFIG_KEYS = new Set(['admin_users']);

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
  counting_channel: 'Counting channel',
  welcome_channel: 'Welcome channel',
  welcome_message: 'Welcome message',
  member_count_voice: 'Member count voice channel',
  embed_style: 'Embed style',
  admin_users: 'Admin users',
  admin_roles: 'Admin roles',
  authorized_roles: 'Restrict review roles',
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
      editable: Object.prototype.hasOwnProperty.call(DEFAULT_GUILD_CONFIG, key)
    })),
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
    iconUrl: guild?.iconURL?.({ size: 96 }) || null,
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

  if (key === 'welcome_message') {
    return String(value || DEFAULT_GUILD_CONFIG.welcome_message).slice(0, 1000);
  }

  if (key === 'sticky') {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      throw httpError(400, 'Sticky config must be valid JSON.');
    }
  }

  const text = String(value || '').trim();
  return text || DEFAULT_GUILD_CONFIG[key] || null;
}

function botSummary(client) {
  const user = client.user;
  return {
    id: user?.id || null,
    tag: user?.tag || 'Discord Bot',
    avatarUrl: user?.displayAvatarURL?.({ size: 128 }) || null,
    status: user?.presence?.status || 'unknown',
    uptimeMs: Number(client.uptime || 0),
    readyAt: client.readyAt?.getTime?.() || null,
    ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : null
  };
}

function guildSummary(guild, db) {
  db.ensureGuildConfig(guild.id);
  const config = db.getAllConfig(guild.id);
  const missingCritical = CRITICAL_CONFIG_KEYS.filter((key) => isEmptyConfigValue(config[key]));

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL?.({ size: 96 }) || null,
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
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
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
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
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
