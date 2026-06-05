const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');
const env = require('../env');
const { DEFAULT_GUILD_CONFIG } = require('../db');
const { EMBED_STYLES, buildEmbed } = require('../embeds');
const { slashCommands } = require('../commands');
const community = require('../services/community');
const dashboardControlResponses = require('../services/dashboardControls');
const inviteRoles = require('../services/inviteRoles');
const ticketService = require('../services/tickets');

const SESSION_COOKIE = 'bot_dashboard_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const STATIC_FILES = new Set(['app.js', 'index.html', 'styles.css']);
const CHANNEL_CREATE_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice
};
const CHANNEL_TYPE_NAMES = Object.fromEntries(Object.entries(CHANNEL_CREATE_TYPES).map(([key, value]) => [value, key]));

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
  'verification_channel',
  'bump_channel',
  'qna_channel',
  'counting_channel',
  'welcome_channel',
  'achievement_channel',
  'level_announce_channel',
  'member_count_voice'
]);

const ROLE_CONFIG_KEYS = new Set([
  'restrict_perms_role',
  'restricted_role',
  'update_ping_role',
  'verified_role',
  'swat_guess_role',
  'auto_role'
]);

const ROLE_LIST_CONFIG_KEYS = new Set(['admin_roles', 'authorized_roles']);
const CHANNEL_LIST_CONFIG_KEYS = new Set(['restriction_exempt_channels']);
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
  'xp_per_message_max',
  'bump_cooldown_minutes'
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
  verification_channel: 'Verification channel',
  verified_role: 'Verified role',
  verification_message: 'Verification message',
  restriction_exempt_channels: 'Restriction exempt channels',
  bump_channel: 'Bump channel',
  bump_cooldown_minutes: 'Bump cooldown minutes',
  qna_channel: 'Q&A channel',
  qna_personality: 'Q&A personality',
  swat_guess_role: 'SWAT guess reward role',
  auto_role: 'Auto role',
  counting_channel: 'Counting channel',
  welcome_channel: 'Welcome channel',
  welcome_message: 'Welcome message',
  achievement_channel: 'Achievement channel',
  invite_role_mappings: 'Invite role mappings',
  invite_count_role_rewards: 'Invite count role rewards',
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

function startDashboard({ client, clients, db }) {
  if (!env.dashboardEnabled) return null;

  const staticRoot = path.join(__dirname, 'public');
  const dashboardClients = clients?.length ? clients : [client].filter(Boolean);
  const sessions = new Map();
  const passwordRequired = Boolean(env.dashboardPassword);

  if (!passwordRequired && !isLoopbackHost(env.dashboardHost)) {
    console.warn('Dashboard disabled: set DASHBOARD_PASSWORD before binding the dashboard to a non-local host.');
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest({ req, res, client, clients: dashboardClients, db, staticRoot, sessions, passwordRequired });
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
  const { req, res, clients, db, staticRoot, sessions, passwordRequired } = context;
  const client = primaryClient(clients);
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
      bot: botSummary(client),
      bots: botSummaries(clients)
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
      sendJson(res, 200, overviewPayload(clients, db));
      return;
    }

    if (pathname === '/api/runtime' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, updateRuntimeFlag(clients, db, body));
      return;
    }

    if (pathname === '/api/presence' && req.method === 'POST') {
      const body = await readJsonBody(req);
      await updatePresence(clients, body);
      sendJson(res, 200, { bot: botSummary(primaryClient(clients)), bots: botSummaries(clients) });
      return;
    }

    if (pathname === '/api/owner/broadcast' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await sendOwnerBroadcast(clients, db, body));
      return;
    }

    if (pathname === '/api/owner/blacklist' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, updateBotBan(clients, db, body));
      return;
    }

    if (pathname === '/api/owner/backup' && req.method === 'POST') {
      sendJson(res, 200, createDashboardBackup(db));
      return;
    }

    if (pathname === '/api/owner/backup/import' && req.method === 'POST') {
      sendJson(res, 200, await importDashboardBackup(req, db));
      return;
    }

    const guildEmbedMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/embed$/);
    if (guildEmbedMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildEmbedMatch[1]);
      sendJson(res, 200, await sendCustomEmbedFromDashboard(clients, db, guildId, body));
      return;
    }

    const guildActionMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/action$/);
    if (guildActionMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildActionMatch[1]);
      sendJson(res, 200, await runGuildAction(clients, db, guildId, body));
      return;
    }

    const guildLeaveMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/leave$/);
    if (guildLeaveMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildLeaveMatch[1]);
      sendJson(res, 200, await leaveGuildFromDashboard(clients, db, guildId, body));
      return;
    }

    const guildConfigMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/config$/);
    if (guildConfigMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildConfigMatch[1]);
      updateGuildConfig(clients, db, guildId, body);
      sendJson(res, 200, guildDetailPayload(clients, db, guildId));
      return;
    }

    const guildTicketPanelMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/tickets\/panel$/);
    if (guildTicketPanelMatch && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = decodeURIComponent(guildTicketPanelMatch[1]);
      sendJson(res, 200, await upsertTicketPanelFromDashboard(clients, db, guildId, body));
      return;
    }

    const guildMatch = pathname.match(/^\/api\/guilds\/([^/]+)$/);
    if (guildMatch && req.method === 'GET') {
      sendJson(res, 200, guildDetailPayload(clients, db, decodeURIComponent(guildMatch[1])));
      return;
    }

    throw httpError(404, 'Dashboard API route not found.');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw httpError(405, 'Method not allowed.');
  }

  serveStatic(res, staticRoot, pathname, req.method === 'HEAD');
}

function clientList(clientOrClients) {
  return (Array.isArray(clientOrClients) ? clientOrClients : [clientOrClients]).filter(Boolean);
}

function primaryClient(clientOrClients) {
  const clients = clientList(clientOrClients);
  return clients.find((client) => client?.isReady?.()) || clients[0] || null;
}

function botSummaries(clientOrClients) {
  return clientList(clientOrClients).map((client, index) => ({
    ...botSummary(client),
    index
  }));
}

function owningClient(clientOrClients, guildId) {
  return clientList(clientOrClients).find((client) => client.guilds?.cache?.has?.(guildId)) || null;
}

function overviewPayload(client, db) {
  const clients = clientList(client);
  const primary = primaryClient(clients);
  const errors = [];
  const stats = safePayloadSection(errors, 'database stats', { filePath: db.filePath || null, tables: {} }, () => db.databaseStats());
  const guilds = safePayloadSection(errors, 'servers', [], () => (
    getGuilds(clients).map((guild) => safeGuildSummary(guild, db, errors))
  ));
  const tables = stats.tables || {};
  return {
    generatedAt: Date.now(),
    bot: botSummary(primary),
    bots: botSummaries(clients),
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
    commandCatalog: safePayloadSection(errors, 'command catalog', [], () => commandCatalogPayload()),
    owner: safePayloadSection(errors, 'owner controls', {}, () => ownerPayload(db, guilds, tables)),
    commandUsage: safePayloadSection(errors, 'command usage', [], () => db.listCommandUsage(12)),
    botBans: safePayloadSection(errors, 'watchlist', [], () => db.listBotBans(null, 10)),
    errors
  };
}

function guildDetailPayload(client, db, guildId) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const ownerClient = owningClient(client, guildId) || primaryClient(client);
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
      display: displayConfigValue(ownerClient, guild, key, config[key]),
      empty: isEmptyConfigValue(config[key]),
      editable: Object.prototype.hasOwnProperty.call(DEFAULT_GUILD_CONFIG, key),
      type: configInputType(key),
      picker: configPickerType(key),
      multiple: ROLE_LIST_CONFIG_KEYS.has(key) || USER_LIST_CONFIG_KEYS.has(key) || CHANNEL_LIST_CONFIG_KEYS.has(key),
      critical: CRITICAL_CONFIG_KEYS.includes(key)
    })),
    options: guildPickerOptions(ownerClient, guild),
    activeRestrictions: safePayloadSection(errors, 'active restrictions', [], () => db.listActiveRestrictions(guild.id, 20)).map((row) => ({
      userId: row.user_id,
      userLabel: userLabel(ownerClient, guild, row.user_id),
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
      targetLabel: row.target_id ? userLabel(ownerClient, guild, row.target_id) : 'No target',
      moderatorId: row.moderator_id,
      moderatorLabel: row.moderator_id ? userLabel(ownerClient, guild, row.moderator_id) : 'Unknown',
      reason: row.reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    ticketPanels: safePayloadSection(errors, 'ticket panels', [], () => db.listTicketPanels(guild.id)).map((row) => ({
      panelId: row.panel_id,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      category: row.category_id ? channelLabel(guild, row.category_id) : 'No category',
      supportRoleId: row.support_role_id,
      supportRole: row.support_role_id ? roleLabel(guild, row.support_role_id) : 'No role',
      mode: row.mode || 'thread',
      panelContent: row.panel_content,
      buttonLabel: row.button_label,
      buttonStyle: row.button_style || 'primary',
      buttonEmoji: row.button_emoji,
      openMessage: row.open_message,
      closeButtonLabel: row.close_button_label,
      deleteButtonLabel: row.delete_button_label,
      panelChannelId: row.panel_channel_id,
      panelChannel: row.panel_channel_id ? channelLabel(guild, row.panel_channel_id) : 'Not posted',
      panelMessageId: row.panel_message_id,
      createdBy: row.created_by,
      createdAt: row.created_at
    })),
    tickets: safePayloadSection(errors, 'tickets', [], () => db.listTickets(guild.id, null, 20)).map((row) => ({
      panelId: row.panel_id,
      userId: row.user_id,
      userLabel: userLabel(ownerClient, guild, row.user_id),
      channelId: row.channel_id,
      channelLabel: channelLabel(guild, row.channel_id),
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at
    })),
    reminders: safePayloadSection(errors, 'reminders', [], () => db.listReminders(guild.id, 10)).map((row) => ({
      userId: row.user_id,
      userLabel: userLabel(ownerClient, guild, row.user_id),
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
        userLabel: userLabel(ownerClient, guild, row.user_id),
        level: row.level,
        xp: row.xp,
        balance: row.balance,
        messages: row.messages
      })),
      topBalance: safePayloadSection(errors, 'coin leaderboard', [], () => db.listProgressLeaderboard(guild.id, 'balance', 5)).map((row) => ({
        userId: row.user_id,
        userLabel: userLabel(ownerClient, guild, row.user_id),
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

function commandCatalogPayload() {
  const commands = slashCommands().map((command) => ({
    name: command.name,
    source: 'slash',
    usage: `/${command.name}`,
    description: command.description,
    subcommands: commandOptions(command)
      .filter((option) => option.type === 1)
      .map((option) => option.name),
    options: commandOptions(command)
      .filter((option) => option.type !== 1)
      .map((option) => option.name)
  }));
  commands.push({
    name: 'ticket-panel',
    source: 'owner',
    usage: 'oc ticket-panel',
    description: 'Create, update, list, and switch ticket panels between thread and channel mode.',
    subcommands: ['create', 'list', 'update', 'mode'],
    options: ['channel', 'mode', 'title', 'description', 'category', 'role']
  });
  return commands;
}

function commandOptions(command) {
  return Array.isArray(command.options) ? command.options : [];
}

function configInputType(key) {
  if (CHANNEL_CONFIG_KEYS.has(key)) return 'channel';
  if (CHANNEL_LIST_CONFIG_KEYS.has(key)) return 'channel-list';
  if (ROLE_CONFIG_KEYS.has(key)) return 'role';
  if (ROLE_LIST_CONFIG_KEYS.has(key)) return 'role-list';
  if (USER_LIST_CONFIG_KEYS.has(key)) return 'user-list';
  if (BOOLEAN_CONFIG_KEYS.has(key)) return 'boolean';
  if (NUMBER_CONFIG_KEYS.has(key)) return 'number';
  if (key === 'embed_style') return 'style';
  if (key === 'anti_raid_action') return 'action';
  if (key === 'sticky' || key === 'role_level_rewards' || key === 'invite_role_mappings' || key === 'invite_count_role_rewards') return 'json';
  if (key === 'welcome_message') return 'message';
  return 'text';
}

function configPickerType(key) {
  if (CHANNEL_CONFIG_KEYS.has(key) || CHANNEL_LIST_CONFIG_KEYS.has(key)) return key === 'member_count_voice' ? 'voiceChannels' : 'textChannels';
  if (ROLE_CONFIG_KEYS.has(key) || ROLE_LIST_CONFIG_KEYS.has(key)) return 'roles';
  if (USER_LIST_CONFIG_KEYS.has(key)) return 'users';
  if (key === 'embed_style') return 'styles';
  if (key === 'anti_raid_action') return 'antiRaidActions';
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
    channels: channelOptions(guild, isManageableGuildChannel),
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
    categories: categoryOptions(guild),
    styles: Object.entries(EMBED_STYLES).map(([id, style]) => ({
      id,
      label: style.name,
      detail: id,
      color: `#${style.color.toString(16).padStart(6, '0')}`
    })),
    antiRaidActions: [
      { id: 'restrict', label: 'Restrict', detail: 'Apply restricted role' },
      { id: 'kick', label: 'Kick', detail: 'Remove joining accounts' },
      { id: 'timeout', label: 'Timeout', detail: 'Temporarily mute joins' },
      { id: 'log', label: 'Log only', detail: 'Record without action' }
    ]
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
      parentId: channel.parentId || null,
      topic: channel.topic || '',
      slowmode: Number(channel.rateLimitPerUser || 0),
      type: CHANNEL_TYPE_NAMES[channel.type] || channelTypeLabel(channel.type).toLowerCase()
    }));
}

function isManageableGuildChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildStageVoice
  ].includes(channel?.type);
}

function categoryOptions(guild) {
  return [...(guild.channels?.cache?.values?.() || [])]
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0) || a.name.localeCompare(b.name))
    .map((channel) => ({
      id: channel.id,
      label: channel.name,
      detail: 'Category',
      parentId: null
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

function colorFromInput(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(0xffffff, Math.round(value)));
  }
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(1), 16);
  if (/^0x[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9]+$/.test(text)) return Math.max(0, Math.min(0xffffff, Number.parseInt(text, 10)));
  return null;
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanUrl(value) {
  const text = cleanText(value, 2048);
  return /^https?:\/\//i.test(text) ? text : null;
}

function urlFromInput(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanUrl(value);
  if (typeof value === 'object') return cleanUrl(value.url);
  return null;
}

function emojiFromInput(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value, 80);
  if (value.id) return value.name ? `${cleanText(value.name, 40)}:${cleanText(value.id, 40)}` : cleanText(value.id, 80);
  return value.name ? cleanText(value.name, 80) : null;
}

function buttonStyle(value) {
  const styles = {
    1: ButtonStyle.Primary,
    2: ButtonStyle.Secondary,
    3: ButtonStyle.Success,
    4: ButtonStyle.Danger,
    5: ButtonStyle.Link,
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
    link: ButtonStyle.Link
  };
  return styles[String(value || '').toLowerCase()] || ButtonStyle.Secondary;
}

function buttonStyleName(value) {
  const styles = {
    1: 'primary',
    2: 'secondary',
    3: 'success',
    4: 'danger',
    5: 'link',
    primary: 'primary',
    secondary: 'secondary',
    success: 'success',
    danger: 'danger',
    link: 'link'
  };
  return styles[String(value || '').toLowerCase()] || 'secondary';
}

function controlsFromRawComponents(components) {
  const buttons = [];
  const selects = [];
  if (!Array.isArray(components)) return { buttons, selects };

  for (const row of components) {
    const rowComponents = Array.isArray(row?.components) ? row.components : [row].filter(Boolean);
    for (const component of rowComponents) {
      if (component.type === 2 || component.label || component.url) {
        buttons.push({
          label: component.label,
          style: buttonStyleName(component.style),
          emoji: emojiFromInput(component.emoji),
          customId: component.customId || component.custom_id,
          url: component.url,
          disabled: component.disabled,
          response: component.response || component.responseMessage || component.message,
          ephemeral: component.ephemeral
        });
        continue;
      }
      if (component.type === 3 || Array.isArray(component.options)) {
        selects.push({
          placeholder: component.placeholder,
          customId: component.customId || component.custom_id,
          minValues: component.minValues ?? component.min_values,
          maxValues: component.maxValues ?? component.max_values,
          options: Array.isArray(component.options)
            ? component.options.map((option) => ({
                label: option.label,
                value: option.value,
                description: option.description,
                emoji: emojiFromInput(option.emoji),
                default: option.default,
                response: option.response || option.responseMessage || option.message,
                ephemeral: option.ephemeral
              }))
            : []
        });
      }
    }
  }

  return { buttons, selects };
}

function dashboardControls(body) {
  const raw = controlsFromRawComponents(body.components);
  return {
    buttons: Array.isArray(body.buttons) ? body.buttons : raw.buttons,
    selects: Array.isArray(body.selects) ? body.selects : raw.selects
  };
}

function dashboardComponents(body, controls = dashboardControls(body)) {
  const rows = [];
  const buttons = controls.buttons.slice(0, 25);
  for (let index = 0; index < buttons.length && rows.length < 5; index += 5) {
    const row = new ActionRowBuilder();
    for (const button of buttons.slice(index, index + 5)) {
      const builder = new ButtonBuilder()
        .setLabel(cleanText(button.label, 80) || 'Button')
        .setStyle(button.url ? ButtonStyle.Link : buttonStyle(button.style))
        .setDisabled(Boolean(button.disabled));
      const emoji = emojiFromInput(button.emoji);
      if (emoji) builder.setEmoji(emoji);
      if (button.url) builder.setURL(cleanUrl(button.url) || 'https://discord.com');
      else builder.setCustomId(cleanText(button.customId || button.custom_id, 100) || `dashboard:button:${index}:${row.components.length}`);
      row.addComponents(builder);
    }
    if (row.components.length) rows.push(row);
  }

  const selects = controls.selects.slice(0, 5 - rows.length);
  for (const select of selects) {
    const options = Array.isArray(select.options) ? select.options.slice(0, 25) : [];
    if (!options.length) continue;
    const minValues = Math.max(0, Math.min(Number(select.minValues ?? select.min_values ?? 1), options.length));
    const maxValues = Math.max(minValues || 1, Math.min(Number(select.maxValues ?? select.max_values ?? 1), options.length));
    const menu = new StringSelectMenuBuilder()
      .setCustomId(cleanText(select.customId || select.custom_id, 100) || `dashboard:select:${rows.length}`)
      .setPlaceholder(cleanText(select.placeholder, 150) || 'Choose an option')
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(options.map((option, optionIndex) => {
        const item = {
          label: cleanText(option.label, 100) || `Option ${optionIndex + 1}`,
          value: cleanText(option.value, 100) || `option-${optionIndex + 1}`,
          description: cleanText(option.description, 100) || undefined,
          default: Boolean(option.default)
        };
        if (option.emoji) item.emoji = emojiFromInput(option.emoji);
        return item;
      }));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  return rows;
}

function rawEmbedSources(body) {
  if (Array.isArray(body.embeds)) {
    return body.embeds.filter((embed) => embed && typeof embed === 'object').slice(0, 10);
  }
  if (body.embed && typeof body.embed === 'object') return [body.embed];
  if (looksLikeRawEmbed(body)) return [body];
  return [];
}

function looksLikeRawEmbed(value) {
  return ['title', 'description', 'color', 'thumbnail', 'image', 'author', 'footer', 'fields', 'timestamp', 'url']
    .some((key) => Object.prototype.hasOwnProperty.call(value || {}, key));
}

function rawEmbedsFromDashboard(body) {
  return rawEmbedSources(body)
    .map(rawEmbedFromInput)
    .filter(Boolean);
}

function rawEmbedFromInput(source) {
  const embed = new EmbedBuilder();
  let hasVisibleContent = false;

  const title = cleanText(source.title, 256);
  if (title) {
    embed.setTitle(title);
    hasVisibleContent = true;
  }

  const description = cleanText(source.description, 4000);
  if (description) {
    embed.setDescription(description);
    hasVisibleContent = true;
  }

  const color = colorFromInput(source.color ?? source.colour);
  if (color !== null) embed.setColor(color);

  const url = cleanUrl(source.url);
  if (url) embed.setURL(url);

  const thumbnail = urlFromInput(source.thumbnail);
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
    hasVisibleContent = true;
  }

  const image = urlFromInput(source.image);
  if (image) {
    embed.setImage(image);
    hasVisibleContent = true;
  }

  if (source.author?.name) {
    embed.setAuthor({
      name: cleanText(source.author.name, 256),
      iconURL: urlFromInput(source.author.iconUrl || source.author.icon_url) || undefined,
      url: cleanUrl(source.author.url) || undefined
    });
    hasVisibleContent = true;
  }

  if (source.footer?.text) {
    embed.setFooter({
      text: cleanText(source.footer.text, 2048),
      iconURL: urlFromInput(source.footer.iconUrl || source.footer.icon_url) || undefined
    });
    hasVisibleContent = true;
  }

  const fields = Array.isArray(source.fields)
    ? source.fields.slice(0, 25).map((field) => ({
        name: cleanText(field.name, 256) || 'Field',
        value: cleanText(field.value, 1024) || 'None',
        inline: Boolean(field.inline)
      }))
    : [];
  if (fields.length) {
    embed.addFields(fields);
    hasVisibleContent = true;
  }

  if (source.timestamp) {
    const timestamp = source.timestamp === true ? new Date() : new Date(source.timestamp);
    if (!Number.isNaN(timestamp.getTime())) embed.setTimestamp(timestamp);
  }

  return hasVisibleContent ? embed : null;
}

async function sendCustomEmbedFromDashboard(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const channelId = String(body.channelId || '').trim();
  if (!channelId) throw httpError(400, 'channelId is required.');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw httpError(400, 'Target channel must be text-based.');
  const embeds = rawEmbedsFromDashboard(body);
  const controls = dashboardControls(body);
  const components = dashboardComponents(body, controls);
  const content = cleanText(body.content, 1900) || undefined;
  if (!content && !embeds.length && !components.length) throw httpError(400, 'Message content, an embed, or components are required.');

  const message = await channel.send({
    content,
    embeds: embeds.length ? embeds : undefined,
    components,
    allowedMentions: { parse: [], users: [], roles: [] }
  });
  dashboardControlResponses.saveDashboardControlResponses(db, guild.id, controls);

  return {
    messageId: message.id,
    channelId: channel.id,
    url: message.url
  };
}

async function upsertTicketPanelFromDashboard(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');

  const panelId = cleanTicketPanelId(body.panelId || body.id || body.name);
  if (!panelId) throw httpError(400, 'Panel ID is required.');

  const existing = ticketService.panelFromRow(db.getTicketPanel(guild.id, panelId));
  const panelChannelId = cleanText(body.panelChannelId || body.channelId, 40);
  const channelChanged = Boolean(existing && panelChannelId && panelChannelId !== existing.panelChannelId);
  const panel = ticketService.normalizePanelData({
    panelId,
    name: body.name,
    description: body.description,
    categoryId: emptyToNull(body.categoryId),
    supportRoleId: emptyToNull(body.supportRoleId),
    mode: body.mode,
    panelContent: body.panelContent,
    buttonLabel: body.buttonLabel,
    buttonStyle: body.buttonStyle,
    buttonEmoji: body.buttonEmoji,
    openMessage: body.openMessage,
    closeButtonLabel: body.closeButtonLabel,
    deleteButtonLabel: body.deleteButtonLabel,
    panelChannelId: panelChannelId || existing?.panelChannelId || null,
    panelMessageId: channelChanged ? null : (body.panelMessageId || existing?.panelMessageId || null),
    createdBy: body.createdBy || env.botOwnerId || 'dashboard'
  }, existing || {});

  if (panel.categoryId && !guild.channels?.cache?.get?.(panel.categoryId)) {
    throw httpError(400, 'Ticket category was not found.');
  }
  if (panel.supportRoleId && !guild.roles?.cache?.get?.(panel.supportRoleId)) {
    throw httpError(400, 'Support role was not found.');
  }

  let action = existing ? 'updated' : 'created';
  let url = null;
  let edited = false;

  if (existing && !channelChanged) {
    const result = await ticketService.updateTicketPanel(db, guild, panel.panelId, panel)
      .catch((err) => {
        throw httpError(400, err.message || 'Ticket panel update failed.');
      });
    edited = Boolean(result.edited);
  }

  if (!existing || channelChanged || !edited) {
    const channel = await dashboardTextChannel(guild, panel.panelChannelId);
    if (!channel) {
      if (existing) {
        db.saveTicketPanel(guild.id, panel);
      } else {
        throw httpError(400, 'Choose a text channel to post the ticket panel.');
      }
    } else {
      const saved = await ticketService.sendTicketPanel(db, {
        guild,
        channel,
        user: { id: env.botOwnerId || 'dashboard' },
        reply: null
      }, panel);
      action = existing ? 'reposted' : 'created';
      url = channel.messages?.cache?.get?.(saved.panelMessageId)?.url || null;
    }
  }

  return {
    action,
    edited,
    panelId: panel.panelId,
    url,
    detail: guildDetailPayload(client, db, guild.id)
  };
}

async function dashboardTextChannel(guild, channelId) {
  const id = String(channelId || '').trim();
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel?.isTextBased?.()) throw httpError(400, 'Ticket panel channel must be text-based.');
  const permissions = channel.permissionsFor?.(guild.members?.me);
  if (permissions && !permissions.has(PermissionsBitField.Flags.SendMessages)) {
    throw httpError(400, 'The bot can not send messages in that ticket panel channel.');
  }
  return channel;
}

function cleanTicketPanelId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function emptyToNull(value) {
  const text = String(value || '').trim();
  return text || null;
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
  return {
    filePath: backupPath,
    database: databasePayload(db.databaseStats())
  };
}

async function importDashboardBackup(req, db) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const sourcePath = contentType === 'application/json'
    ? await backupPathFromJson(req)
    : await saveUploadedBackup(req);

  try {
    const result = db.importFromBackup(sourcePath);
    return {
      ...result,
      importedRows: result.tables.reduce((sum, item) => sum + Number(item.rows || 0), 0),
      database: databasePayload(result.database)
    };
  } catch (err) {
    throw httpError(400, err.message || 'Backup import failed.');
  }
}

async function backupPathFromJson(req) {
  const body = await readJsonBody(req);
  const filePath = String(body.filePath || body.path || '').trim();
  if (!filePath) throw httpError(400, 'Backup filePath is required.');
  return filePath;
}

async function saveUploadedBackup(req) {
  const body = await readRawBody(req, MAX_BACKUP_BYTES);
  if (!body.length) throw httpError(400, 'Backup upload is empty.');

  const fileName = safeBackupFileName(req.headers['x-backup-name']);
  const targetPath = path.join('data', 'backups', 'imports', `${timestampName()}-${fileName}`);
  const resolved = path.resolve(process.cwd(), targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, body);
  return resolved;
}

function safeBackupFileName(value) {
  const base = path.basename(String(value || 'backup.sqlite')).replace(/[^a-z0-9._-]/gi, '_').slice(0, 100);
  const name = base || 'backup.sqlite';
  return path.extname(name) ? name : `${name}.sqlite`;
}

function databasePayload(stats) {
  const tables = stats.tables || {};
  return {
    ...stats,
    totalRows: Object.values(tables).reduce((sum, count) => sum + count, 0)
  };
}

async function runGuildAction(client, db, guildId, body) {
  const guild = getGuild(client, guildId);
  if (!guild) throw httpError(404, 'Guild not found.');
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'server-rename') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageGuild, 'Manage Server');
    const name = cleanName(body.name, 'Server name', 2, 100);
    await guild.setName(name, 'Dashboard server rename');
    return {
      action,
      message: `Renamed server to ${name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'channel-create') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const name = cleanName(body.name, 'Channel name', 1, 100);
    const type = channelCreateType(body.channelType);
    const options = {
      name,
      type,
      reason: 'Dashboard channel create'
    };
    const parentId = emptyToNull(body.parentId);
    if (parentId) options.parent = requireCategory(guild, parentId).id;
    const topic = cleanOptionalText(body.topic, 1024);
    if (topic && [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(type)) {
      options.topic = topic;
    }
    const slowmode = boundedInteger(body.slowmode, 0, 21600, 0);
    if (type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement) {
      options.rateLimitPerUser = slowmode;
    }
    const channel = await guild.channels.create(options);
    return {
      action,
      resource: channelResource(channel),
      message: `Created ${channelTypeLabel(type).toLowerCase()} channel #${channel.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'channel-rename') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const channel = requireGuildChannel(guild, body.channelId);
    const name = cleanName(body.name, 'Channel name', 1, 100);
    await channel.setName(name, 'Dashboard channel rename');
    return {
      action,
      resource: channelResource(channel),
      message: `Renamed channel to #${name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'channel-update') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const channel = requireGuildChannel(guild, body.channelId);
    const changes = [];
    const parentId = emptyToNull(body.parentId);
    if (Object.prototype.hasOwnProperty.call(body, 'parentId') && channel.type !== ChannelType.GuildCategory) {
      if (parentId) {
        await channel.setParent(requireCategory(guild, parentId).id, { lockPermissions: false, reason: 'Dashboard channel category update' });
        changes.push('category');
      } else if (channel.parentId) {
        await channel.setParent(null, { lockPermissions: false, reason: 'Dashboard channel category clear' });
        changes.push('category');
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'topic') && typeof channel.setTopic === 'function') {
      await channel.setTopic(cleanOptionalText(body.topic, 1024), 'Dashboard channel topic update');
      changes.push('topic');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'slowmode') && typeof channel.setRateLimitPerUser === 'function') {
      const seconds = boundedInteger(body.slowmode, 0, 21600, 0);
      await channel.setRateLimitPerUser(seconds, 'Dashboard channel slowmode update');
      changes.push('slowmode');
    }
    const lockState = String(body.lockState || 'keep').trim().toLowerCase();
    if (['lock', 'unlock'].includes(lockState)) {
      await channel.permissionOverwrites.edit(guild.id, { SendMessages: lockState === 'lock' ? false : null }, { reason: `Dashboard channel ${lockState}` });
      changes.push(lockState);
    }
    return {
      action,
      resource: channelResource(channel),
      message: changes.length ? `Updated #${channel.name}: ${changes.join(', ')}.` : `No changes applied to #${channel.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'channel-delete') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const channel = requireGuildChannel(guild, body.channelId);
    requireDeleteConfirm(body.confirm, channel.id, channel.name);
    const resource = channelResource(channel);
    await channel.delete('Dashboard channel delete');
    return {
      action,
      resource,
      message: `Deleted #${resource.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'category-create') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const name = cleanName(body.name, 'Category name', 1, 100);
    const category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      reason: 'Dashboard category create'
    });
    return {
      action,
      resource: channelResource(category),
      message: `Created category ${category.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'category-rename') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const category = requireCategory(guild, body.categoryId);
    const name = cleanName(body.name, 'Category name', 1, 100);
    await category.setName(name, 'Dashboard category rename');
    return {
      action,
      resource: channelResource(category),
      message: `Renamed category to ${name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'category-delete') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const category = requireCategory(guild, body.categoryId);
    requireDeleteConfirm(body.confirm, category.id, category.name);
    const resource = channelResource(category);
    await category.delete('Dashboard category delete');
    return {
      action,
      resource,
      message: `Deleted category ${resource.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'role-create') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageRoles, 'Manage Roles');
    const name = cleanName(body.name, 'Role name', 1, 100);
    const role = await guild.roles.create({
      name,
      color: colorValue(body.color),
      hoist: Boolean(body.hoist),
      mentionable: Boolean(body.mentionable),
      reason: 'Dashboard role create'
    });
    return {
      action,
      resource: roleResource(role),
      message: `Created role @${role.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'role-rename') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageRoles, 'Manage Roles');
    const role = requireEditableRole(guild, body.roleId);
    const name = cleanName(body.name, 'Role name', 1, 100);
    await role.setName(name, 'Dashboard role rename');
    return {
      action,
      resource: roleResource(role),
      message: `Renamed role to @${name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'role-delete') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageRoles, 'Manage Roles');
    const role = requireEditableRole(guild, body.roleId);
    requireDeleteConfirm(body.confirm, role.id, role.name);
    const resource = roleResource(role);
    await role.delete('Dashboard role delete');
    return {
      action,
      resource,
      message: `Deleted role @${resource.name}.`,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'lockdown' || action === 'unlockdown') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
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

  if (action === 'channel-restriction') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const result = await community.applyChannelRestriction(db, guild, db.getConfig(guild.id, 'restriction_exempt_channels', []));
    return {
      action,
      updatedChannels: result.updated,
      skippedChannels: result.skipped,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  if (action === 'mass-sync-categories') {
    requireGuildPermission(guild, PermissionsBitField.Flags.ManageChannels, 'Manage Channels');
    const result = await community.massSyncCategoryPermissions(guild);
    return {
      action,
      updatedChannels: result.synced,
      skippedChannels: result.skipped,
      detail: guildDetailPayload(client, db, guild.id)
    };
  }

  throw httpError(400, 'Unknown server action.');
}

function requireGuildPermission(guild, permission, label) {
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(permission)) {
    throw httpError(403, `Bot needs ${label} permission for this action.`);
  }
}

function cleanName(value, label, min, max) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < min) throw httpError(400, `${label} is required.`);
  if (text.length > max) throw httpError(400, `${label} must be ${max} characters or less.`);
  return text;
}

function cleanOptionalText(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function emptyToNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function channelCreateType(value) {
  const key = String(value || 'text').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_CREATE_TYPES, key)) {
    throw httpError(400, 'Unknown channel type.');
  }
  return CHANNEL_CREATE_TYPES[key];
}

function requireGuildChannel(guild, channelId) {
  const channel = guild.channels?.cache?.get?.(String(channelId || '').trim());
  if (!channel || !isManageableGuildChannel(channel)) {
    throw httpError(404, 'Channel not found.');
  }
  return channel;
}

function requireCategory(guild, categoryId) {
  const category = guild.channels?.cache?.get?.(String(categoryId || '').trim());
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw httpError(404, 'Category not found.');
  }
  return category;
}

function requireEditableRole(guild, roleId) {
  const role = guild.roles?.cache?.get?.(String(roleId || '').trim());
  if (!role || role.id === guild.id) throw httpError(404, 'Role not found.');
  if (role.managed) throw httpError(400, 'Managed roles cannot be changed from the dashboard.');
  if (role.editable === false) throw httpError(403, 'Move the bot role above this role before changing it.');
  return role;
}

function requireDeleteConfirm(confirm, expectedId, name) {
  const value = String(confirm || '').trim();
  if (value !== expectedId) {
    throw httpError(400, `Confirm delete for ${name} by sending its exact ID.`);
  }
}

function channelResource(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: CHANNEL_TYPE_NAMES[channel.type] || channelTypeLabel(channel.type),
    parentId: channel.parentId || null
  };
}

function roleResource(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.hexColor || null,
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable)
  };
}

function colorValue(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(1), 16);
  if (/^0x[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  throw httpError(400, 'Role color must be a hex color.');
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
    bot: botSummary(primaryClient(client)),
    bots: botSummaries(client)
  };
}

async function updatePresence(client, body) {
  const clients = clientList(client);
  const status = String(body.status || '').trim().toLowerCase();
  const activityType = String(body.activityType || 'playing').trim().toLowerCase();
  const activityText = String(body.activityText || '').trim();

  if (status) {
    if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) {
      throw httpError(400, 'Invalid bot status.');
    }
    for (const bot of clients) {
      await bot.user?.setStatus?.(status);
    }
  }

  if (activityText) {
    for (const bot of clients) {
      await bot.user?.setActivity?.(activityText.slice(0, 128), {
        type: ACTIVITY_TYPES[activityType] ?? ActivityType.Playing
      });
    }
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
  if (USER_LIST_CONFIG_KEYS.has(key) || ROLE_LIST_CONFIG_KEYS.has(key) || CHANNEL_LIST_CONFIG_KEYS.has(key)) {
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

  if (key === 'sticky' || key === 'role_level_rewards' || key === 'invite_role_mappings' || key === 'invite_count_role_rewards') {
    if (key === 'role_level_rewards' && !value) return [];
    if (key === 'invite_role_mappings' && !value) return [];
    if (key === 'invite_count_role_rewards' && !value) return [];
    if (!value) return null;
    if (typeof value === 'object') {
      if (key === 'invite_role_mappings') return inviteRoles.normalizeInviteRoleMappings(value);
      if (key === 'invite_count_role_rewards') return inviteRoles.normalizeInviteCountRoleRewards(value);
      return value;
    }
    try {
      const parsed = JSON.parse(String(value));
      if (key === 'invite_role_mappings') return inviteRoles.normalizeInviteRoleMappings(parsed);
      if (key === 'invite_count_role_rewards') return inviteRoles.normalizeInviteCountRoleRewards(parsed);
      return parsed;
    } catch {
      throw httpError(400, `${CONFIG_LABELS[key] || key} must be valid JSON.`);
    }
  }

  const text = String(value || '').trim();
  return text || DEFAULT_GUILD_CONFIG[key] || null;
}

function botSummary(client) {
  if (!client) {
    return {
      id: null,
      tag: 'Discord Bot',
      avatarUrl: null,
      status: 'offline',
      activityType: null,
      activityText: '',
      uptimeMs: 0,
      readyAt: null,
      ping: null
    };
  }
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
  const guilds = new Map();
  for (const bot of clientList(client)) {
    for (const guild of bot.guilds?.cache?.values?.() || []) {
      if (!guilds.has(guild.id)) guilds.set(guild.id, guild);
    }
  }
  return [...guilds.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getGuild(client, guildId) {
  for (const bot of clientList(client)) {
    const guild = bot.guilds?.cache?.get?.(guildId);
    if (guild) return guild;
  }
  return null;
}

function collectionSize(collection) {
  return Number(collection?.size || 0);
}

function displayConfigValue(client, guild, key, value) {
  if (isEmptyConfigValue(value)) return 'Not set';
  if (CHANNEL_CONFIG_KEYS.has(key)) return channelLabel(guild, value);
  if (CHANNEL_LIST_CONFIG_KEYS.has(key)) return listConfigValues(value).map((id) => channelLabel(guild, id)).join(', ');
  if (ROLE_CONFIG_KEYS.has(key)) return roleLabel(guild, value);
  if (ROLE_LIST_CONFIG_KEYS.has(key)) return listConfigValues(value).map((id) => roleLabel(guild, id)).join(', ');
  if (USER_LIST_CONFIG_KEYS.has(key)) return listConfigValues(value).map((id) => userLabel(client, guild, id)).join(', ');
  if (BOOLEAN_CONFIG_KEYS.has(key)) return value ? 'Enabled' : 'Disabled';
  if (key === 'anti_raid_action') {
    const labels = { restrict: 'Restrict', kick: 'Kick', timeout: 'Timeout', log: 'Log only' };
    return labels[String(value || '').toLowerCase()] || String(value);
  }
  if (key === 'sticky') {
    return value?.channelId ? `${channelLabel(guild, value.channelId)} - ${value.message || 'Sticky message'}` : JSON.stringify(value);
  }
  if (key === 'invite_role_mappings') {
    return inviteRoles.normalizeInviteRoleMappings(value)
      .map((mapping) => `${mapping.code} -> ${roleLabel(guild, mapping.roleId)}`)
      .join(', ');
  }
  if (key === 'invite_count_role_rewards') {
    return inviteRoles.normalizeInviteCountRoleRewards(value)
      .map((reward) => `${reward.invites} invites -> ${roleLabel(guild, reward.roleId)}`)
      .join(', ');
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

async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw httpError(413, 'Backup file is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
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
