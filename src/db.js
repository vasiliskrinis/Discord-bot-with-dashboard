const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_GUILD_CONFIG = {
  restrict_perms_role: null,
  restricted_role: null,
  restrict_channel: null,
  advanced_logs_channel: null,
  restrict_logs_channel: null,
  restricted_users_channel: null,
  roblox_updates_channel: null,
  executor_updates_channel: null,
  update_ping_role: null,
  counting_channel: null,
  welcome_channel: null,
  welcome_message: 'Welcome {user} to {server}. You are member #{memberCount}.',
  member_count_voice: null,
  embed_style: 'sapphire',
  admin_users: [],
  admin_roles: [],
  authorized_roles: [],
  sticky: null
};

function now() {
  return Date.now();
}

function encode(value) {
  return JSON.stringify(value);
}

function decode(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class BotDatabase {
  constructor(filePath) {
    const resolved = filePath === ':memory:' ? ':memory:' : path.resolve(process.cwd(), filePath);
    this.filePath = resolved;
    if (resolved !== ':memory:') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
    }
    this.db = new DatabaseSync(resolved);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, key)
      );

      CREATE TABLE IF NOT EXISTS guild_state (
        guild_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, key)
      );

      CREATE TABLE IF NOT EXISTS restrictions (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        original_roles TEXT NOT NULL DEFAULT '[]',
        restricted_by TEXT,
        reason TEXT,
        source TEXT,
        expires_at INTEGER,
        last_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS cases (
        guild_id TEXT NOT NULL,
        case_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        target_id TEXT,
        moderator_id TEXT,
        reason TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, case_id)
      );

      CREATE TABLE IF NOT EXISTS warnings (
        guild_id TEXT NOT NULL,
        case_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, case_id)
      );

      CREATE TABLE IF NOT EXISTS notes (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS afk (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reason TEXT,
        since INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS snipes (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        author_id TEXT,
        content TEXT,
        attachment_url TEXT,
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS temp_roles (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        granted_by TEXT,
        reason TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS bot_bans (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      );

      CREATE TABLE IF NOT EXISTS ticket_panels (
        guild_id TEXT NOT NULL,
        panel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category_id TEXT,
        support_role_id TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, panel_id)
      );

      CREATE TABLE IF NOT EXISTS tickets (
        guild_id TEXT NOT NULL,
        panel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        status TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        PRIMARY KEY (guild_id, panel_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS booster_roles (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS reminders (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS giveaways (
        guild_id TEXT NOT NULL,
        giveaway_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        prize TEXT NOT NULL,
        winner_count INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        ended INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, giveaway_id)
      );

      CREATE TABLE IF NOT EXISTS ai_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        preset_key TEXT,
        version INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_prompts_lookup
        ON ai_prompts (scope_type, scope_id, name, active);

      CREATE INDEX IF NOT EXISTS idx_ai_prompts_history
        ON ai_prompts (scope_type, scope_id, name, version);

      CREATE TABLE IF NOT EXISTS ai_prompt_presets (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_by TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_usage (
        command_name TEXT NOT NULL,
        source TEXT NOT NULL,
        guild_id TEXT,
        user_id TEXT,
        count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL,
        PRIMARY KEY (command_name, source, guild_id, user_id)
      );
    `);
    this.ensureDefaultPromptPresets();
  }

  getGlobalState(key, fallback = null) {
    return this.getState('__global__', key, fallback);
  }

  setGlobalState(key, value) {
    this.setState('__global__', key, value);
  }

  runtimeFlags() {
    return {
      maintenance: Boolean(this.getGlobalState('maintenance', false)),
      panicMode: Boolean(this.getGlobalState('panic_mode', false)),
      aiLocked: Boolean(this.getGlobalState('ai_locked', false)),
      botLocked: Boolean(this.getGlobalState('bot_locked', false))
    };
  }

  getConfig(guildId, key, fallback = null) {
    const row = this.db
      .prepare('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?')
      .get(guildId, key);
    return row ? decode(row.value, fallback) : fallback;
  }

  setConfig(guildId, key, value) {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(guildId, key, encode(value), now());
  }

  deleteConfig(guildId, key) {
    this.db.prepare('DELETE FROM guild_config WHERE guild_id = ? AND key = ?').run(guildId, key);
  }

  ensureGuildConfig(guildId) {
    for (const [key, value] of Object.entries(DEFAULT_GUILD_CONFIG)) {
      const existing = this.db
        .prepare('SELECT 1 FROM guild_config WHERE guild_id = ? AND key = ?')
        .get(guildId, key);
      if (!existing) {
        this.setConfig(guildId, key, value);
      }
    }
  }

  getAllConfig(guildId) {
    this.ensureGuildConfig(guildId);
    const rows = this.db
      .prepare('SELECT key, value FROM guild_config WHERE guild_id = ? ORDER BY key ASC')
      .all(guildId);
    return Object.fromEntries(rows.map((row) => [row.key, decode(row.value)]));
  }

  addToConfigArray(guildId, key, value) {
    const values = this.getConfig(guildId, key, []);
    if (!values.includes(value)) values.push(value);
    this.setConfig(guildId, key, values);
    return values;
  }

  removeFromConfigArray(guildId, key, value) {
    const values = this.getConfig(guildId, key, []).filter((item) => item !== value);
    this.setConfig(guildId, key, values);
    return values;
  }

  getState(guildId, key, fallback = null) {
    const row = this.db
      .prepare('SELECT value FROM guild_state WHERE guild_id = ? AND key = ?')
      .get(guildId, key);
    return row ? decode(row.value, fallback) : fallback;
  }

  setState(guildId, key, value) {
    this.db
      .prepare(
        `INSERT INTO guild_state (guild_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(guildId, key, encode(value), now());
  }

  nextCaseId(guildId) {
    const current = Number(this.getState(guildId, 'next_case_id', 1));
    this.setState(guildId, 'next_case_id', current + 1);
    return current;
  }

  createCase(guildId, type, targetId, moderatorId, reason, metadata = {}) {
    const caseId = this.nextCaseId(guildId);
    const time = now();
    this.db
      .prepare(
        `INSERT INTO cases
         (guild_id, case_id, type, target_id, moderator_id, reason, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(guildId, caseId, type, targetId || null, moderatorId || null, reason || null, encode(metadata), time, time);
    return caseId;
  }

  updateCase(guildId, caseId, fields) {
    const row = this.getCase(guildId, caseId);
    if (!row) return null;
    const next = {
      type: fields.type ?? row.type,
      target_id: fields.target_id ?? row.target_id,
      moderator_id: fields.moderator_id ?? row.moderator_id,
      reason: fields.reason ?? row.reason,
      metadata: fields.metadata ?? row.metadata
    };
    this.db
      .prepare(
        `UPDATE cases
         SET type = ?, target_id = ?, moderator_id = ?, reason = ?, metadata = ?, updated_at = ?
         WHERE guild_id = ? AND case_id = ?`
      )
      .run(
        next.type,
        next.target_id,
        next.moderator_id,
        next.reason,
        encode(next.metadata || {}),
        now(),
        guildId,
        caseId
      );
    return this.getCase(guildId, caseId);
  }

  deleteCase(guildId, caseId) {
    this.db.prepare('DELETE FROM cases WHERE guild_id = ? AND case_id = ?').run(guildId, caseId);
    this.db.prepare('DELETE FROM warnings WHERE guild_id = ? AND case_id = ?').run(guildId, caseId);
  }

  getCase(guildId, caseId) {
    const row = this.db
      .prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?')
      .get(guildId, caseId);
    if (!row) return null;
    return { ...row, metadata: decode(row.metadata, {}) };
  }

  listCases(guildId, targetId = null, limit = 10) {
    if (targetId) {
      return this.db
        .prepare(
          `SELECT * FROM cases
           WHERE guild_id = ? AND target_id = ?
           ORDER BY case_id DESC LIMIT ?`
        )
        .all(guildId, targetId, limit)
        .map((row) => ({ ...row, metadata: decode(row.metadata, {}) }));
    }
    return this.db
      .prepare('SELECT * FROM cases WHERE guild_id = ? ORDER BY case_id DESC LIMIT ?')
      .all(guildId, limit)
      .map((row) => ({ ...row, metadata: decode(row.metadata, {}) }));
  }

  setRestriction(guildId, userId, data) {
    const existing = this.getRestriction(guildId, userId);
    const createdAt = existing?.created_at || now();
    this.db
      .prepare(
        `INSERT INTO restrictions
         (guild_id, user_id, active, original_roles, restricted_by, reason, source, expires_at, last_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET
          active = excluded.active,
          original_roles = excluded.original_roles,
          restricted_by = excluded.restricted_by,
          reason = excluded.reason,
          source = excluded.source,
          expires_at = excluded.expires_at,
          last_message = excluded.last_message,
          updated_at = excluded.updated_at`
      )
      .run(
        guildId,
        userId,
        data.active ? 1 : 0,
        encode(data.originalRoles || []),
        data.restrictedBy || null,
        data.reason || null,
        data.source || null,
        data.expiresAt || null,
        data.lastMessage || null,
        createdAt,
        now()
      );
  }

  clearRestriction(guildId, userId) {
    this.db
      .prepare(
        `UPDATE restrictions
         SET active = 0, updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      )
      .run(now(), guildId, userId);
  }

  getRestriction(guildId, userId) {
    const row = this.db
      .prepare('SELECT * FROM restrictions WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId);
    if (!row) return null;
    return { ...row, active: Boolean(row.active), original_roles: decode(row.original_roles, []) };
  }

  getActiveRestriction(guildId, userId) {
    const restriction = this.getRestriction(guildId, userId);
    return restriction?.active ? restriction : null;
  }

  listActiveRestrictions(guildId, limit = 25) {
    return this.db
      .prepare(
        `SELECT * FROM restrictions
         WHERE guild_id = ? AND active = 1
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(guildId, Math.max(1, Math.min(limit, 100)))
      .map((row) => ({ ...row, active: Boolean(row.active), original_roles: decode(row.original_roles, []) }));
  }

  dueRestrictions() {
    return this.db
      .prepare('SELECT * FROM restrictions WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?')
      .all(now())
      .map((row) => ({ ...row, active: Boolean(row.active), original_roles: decode(row.original_roles, []) }));
  }

  addWarning(guildId, userId, moderatorId, reason, caseId) {
    const time = now();
    this.db
      .prepare(
        `INSERT INTO warnings
         (guild_id, case_id, user_id, moderator_id, reason, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(guildId, caseId, userId, moderatorId, reason || null, time, time);
  }

  removeWarning(guildId, caseId) {
    this.db
      .prepare('UPDATE warnings SET active = 0, updated_at = ? WHERE guild_id = ? AND case_id = ?')
      .run(now(), guildId, caseId);
  }

  listWarnings(guildId, userId) {
    return this.db
      .prepare(
        `SELECT * FROM warnings
         WHERE guild_id = ? AND user_id = ? AND active = 1
         ORDER BY case_id DESC`
      )
      .all(guildId, userId);
  }

  addNote(guildId, userId, moderatorId, note) {
    this.db
      .prepare(
        'INSERT INTO notes (guild_id, user_id, moderator_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(guildId, userId, moderatorId, note, now());
  }

  listNotes(guildId, userId, limit = 10) {
    return this.db
      .prepare(
        `SELECT * FROM notes
         WHERE guild_id = ? AND user_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(guildId, userId, limit);
  }

  setAfk(guildId, userId, reason) {
    this.db
      .prepare(
        `INSERT INTO afk (guild_id, user_id, reason, since)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, since = excluded.since`
      )
      .run(guildId, userId, reason || null, now());
  }

  getAfk(guildId, userId) {
    return this.db.prepare('SELECT * FROM afk WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  }

  clearAfk(guildId, userId) {
    this.db.prepare('DELETE FROM afk WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }

  setSnipe(guildId, channelId, authorId, content, attachmentUrl) {
    this.db
      .prepare(
        `INSERT INTO snipes (guild_id, channel_id, author_id, content, attachment_url, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          author_id = excluded.author_id,
          content = excluded.content,
          attachment_url = excluded.attachment_url,
          deleted_at = excluded.deleted_at`
      )
      .run(guildId, channelId, authorId || null, content || null, attachmentUrl || null, now());
  }

  getSnipe(guildId, channelId) {
    return this.db
      .prepare('SELECT * FROM snipes WHERE guild_id = ? AND channel_id = ?')
      .get(guildId, channelId);
  }

  addTempRole(guildId, userId, roleId, grantedBy, reason, expiresAt) {
    this.db
      .prepare(
        `INSERT INTO temp_roles (guild_id, user_id, role_id, granted_by, reason, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id, role_id) DO UPDATE SET
          granted_by = excluded.granted_by,
          reason = excluded.reason,
          expires_at = excluded.expires_at`
      )
      .run(guildId, userId, roleId, grantedBy || null, reason || null, expiresAt, now());
  }

  removeTempRole(guildId, userId, roleId) {
    this.db
      .prepare('DELETE FROM temp_roles WHERE guild_id = ? AND user_id = ? AND role_id = ?')
      .run(guildId, userId, roleId);
  }

  listTempRoles(guildId, userId = null) {
    if (userId) {
      return this.db
        .prepare('SELECT * FROM temp_roles WHERE guild_id = ? AND user_id = ? ORDER BY expires_at ASC')
        .all(guildId, userId);
    }
    return this.db.prepare('SELECT * FROM temp_roles WHERE guild_id = ? ORDER BY expires_at ASC').all(guildId);
  }

  dueTempRoles() {
    return this.db.prepare('SELECT * FROM temp_roles WHERE expires_at <= ?').all(now());
  }

  addBotBan(kind, id, reason) {
    this.db
      .prepare(
        `INSERT INTO bot_bans (kind, id, reason, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`
      )
      .run(kind, id, reason || null, now());
  }

  removeBotBan(kind, id) {
    this.db.prepare('DELETE FROM bot_bans WHERE kind = ? AND id = ?').run(kind, id);
  }

  isBotBanned(kind, id) {
    return Boolean(this.db.prepare('SELECT 1 FROM bot_bans WHERE kind = ? AND id = ?').get(kind, id));
  }

  listBotBans(kind = null, limit = 25) {
    if (kind) {
      return this.db
        .prepare('SELECT * FROM bot_bans WHERE kind = ? ORDER BY created_at DESC LIMIT ?')
        .all(kind, Math.max(1, Math.min(limit, 100)));
    }
    return this.db
      .prepare('SELECT * FROM bot_bans ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(limit, 100)));
  }

  recordCommandUsage(commandName, source, guildId, userId) {
    this.db
      .prepare(
        `INSERT INTO command_usage (command_name, source, guild_id, user_id, count, last_used_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(command_name, source, guild_id, user_id) DO UPDATE SET
          count = count + 1,
          last_used_at = excluded.last_used_at`
      )
      .run(commandName, source, guildId || 'dm', userId || 'unknown', now());
  }

  listCommandUsage(limit = 15) {
    return this.db
      .prepare(
        `SELECT command_name, source, SUM(count) AS count, MAX(last_used_at) AS last_used_at
         FROM command_usage
         GROUP BY command_name, source
         ORDER BY count DESC, last_used_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(limit, 50)));
  }

  databaseStats() {
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
      .all()
      .map((row) => row.name);
    const counts = {};
    for (const table of tables) {
      counts[table] = this.db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
    }
    return {
      filePath: this.filePath,
      tables: counts
    };
  }

  backupTo(filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    const escaped = resolved.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escaped}';`);
    return resolved;
  }

  saveTicketPanel(guildId, panel) {
    this.db
      .prepare(
        `INSERT INTO ticket_panels
         (guild_id, panel_id, name, description, category_id, support_role_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, panel_id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          category_id = excluded.category_id,
          support_role_id = excluded.support_role_id`
      )
      .run(
        guildId,
        panel.panelId,
        panel.name,
        panel.description || null,
        panel.categoryId || null,
        panel.supportRoleId || null,
        panel.createdBy || null,
        panel.createdAt || now()
      );
  }

  getTicketPanel(guildId, panelId) {
    return this.db
      .prepare('SELECT * FROM ticket_panels WHERE guild_id = ? AND panel_id = ?')
      .get(guildId, panelId);
  }

  listTicketPanels(guildId) {
    return this.db
      .prepare('SELECT * FROM ticket_panels WHERE guild_id = ? ORDER BY created_at DESC')
      .all(guildId);
  }

  saveTicket(guildId, panelId, userId, channelId, status = 'open') {
    this.db
      .prepare(
        `INSERT INTO tickets (guild_id, panel_id, user_id, channel_id, status, opened_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, panel_id, user_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          status = excluded.status,
          opened_at = excluded.opened_at,
          closed_at = NULL`
      )
      .run(guildId, panelId, userId, channelId, status, now());
  }

  getOpenTicket(guildId, panelId, userId) {
    return this.db
      .prepare(
        `SELECT * FROM tickets
         WHERE guild_id = ? AND panel_id = ? AND user_id = ? AND status = 'open'`
      )
      .get(guildId, panelId, userId);
  }

  getTicketByChannel(guildId, channelId) {
    return this.db
      .prepare("SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status = 'open'")
      .get(guildId, channelId);
  }

  listTickets(guildId, status = null, limit = 25) {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    if (status) {
      return this.db
        .prepare(
          `SELECT * FROM tickets
           WHERE guild_id = ? AND status = ?
           ORDER BY opened_at DESC
           LIMIT ?`
        )
        .all(guildId, status, boundedLimit);
    }
    return this.db
      .prepare(
        `SELECT * FROM tickets
         WHERE guild_id = ?
         ORDER BY opened_at DESC
         LIMIT ?`
      )
      .all(guildId, boundedLimit);
  }

  closeTicket(guildId, channelId) {
    this.db
      .prepare("UPDATE tickets SET status = 'closed', closed_at = ? WHERE guild_id = ? AND channel_id = ?")
      .run(now(), guildId, channelId);
  }

  setBoosterRole(guildId, userId, roleId) {
    this.db
      .prepare(
        `INSERT INTO booster_roles (guild_id, user_id, role_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET role_id = excluded.role_id`
      )
      .run(guildId, userId, roleId, now());
  }

  getBoosterRole(guildId, userId) {
    return this.db
      .prepare('SELECT * FROM booster_roles WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId);
  }

  addReminder(guildId, userId, channelId, message, dueAt) {
    this.db
      .prepare(
        'INSERT INTO reminders (guild_id, user_id, channel_id, message, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(guildId, userId, channelId, message, dueAt, now());
  }

  dueReminders() {
    return this.db.prepare('SELECT rowid, * FROM reminders WHERE due_at <= ?').all(now());
  }

  listReminders(guildId, limit = 25) {
    return this.db
      .prepare(
        `SELECT rowid, * FROM reminders
         WHERE guild_id = ?
         ORDER BY due_at ASC
         LIMIT ?`
      )
      .all(guildId, Math.max(1, Math.min(limit, 100)));
  }

  deleteReminder(rowid) {
    this.db.prepare('DELETE FROM reminders WHERE rowid = ?').run(rowid);
  }

  createGiveaway(guildId, data) {
    this.db
      .prepare(
        `INSERT INTO giveaways
         (guild_id, giveaway_id, channel_id, message_id, prize, winner_count, ends_at, created_by, ended)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        guildId,
        data.giveawayId,
        data.channelId,
        data.messageId || null,
        data.prize,
        data.winnerCount,
        data.endsAt,
        data.createdBy
      );
  }

  getGiveaway(guildId, giveawayId) {
    return this.db
      .prepare('SELECT * FROM giveaways WHERE guild_id = ? AND giveaway_id = ?')
      .get(guildId, giveawayId);
  }

  dueGiveaways() {
    return this.db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(now());
  }

  listGiveaways(guildId, limit = 25) {
    return this.db
      .prepare(
        `SELECT * FROM giveaways
         WHERE guild_id = ?
         ORDER BY ends_at DESC
         LIMIT ?`
      )
      .all(guildId, Math.max(1, Math.min(limit, 100)));
  }

  endGiveaway(guildId, giveawayId) {
    this.db
      .prepare('UPDATE giveaways SET ended = 1 WHERE guild_id = ? AND giveaway_id = ?')
      .run(guildId, giveawayId);
  }

  ensureDefaultPromptPresets() {
    const presets = [
      {
        key: 'moderation',
        label: 'Moderation Assistant',
        content: 'Stay calm, neutral, and evidence-focused. Give moderators short next steps and avoid guessing.'
      },
      {
        key: 'tickets',
        label: 'Ticket Helper',
        content: 'Help staff collect missing details, summarize the issue, and suggest practical support replies.'
      },
      {
        key: 'security',
        label: 'Security Review',
        content: 'Watch for raid, scam, impersonation, token theft, and account-compromise risks. Be careful and precise.'
      },
      {
        key: 'community',
        label: 'Community Helper',
        content: 'Answer members in a friendly, concise way while matching the server rules and tone.'
      }
    ];

    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO ai_prompt_presets (key, label, content, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const preset of presets) {
      statement.run(preset.key, preset.label, preset.content, 'system', now());
    }
  }

  rowToPrompt(row) {
    if (!row) return null;
    return {
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      name: row.name,
      content: row.content,
      presetKey: row.preset_key,
      version: row.version,
      active: Boolean(row.active),
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  }

  rowToPreset(row) {
    if (!row) return null;
    return {
      key: row.key,
      label: row.label,
      content: row.content,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    };
  }

  normalizePromptScope(scopeType, scopeId) {
    return scopeType === 'global' ? 'global' : String(scopeId || '').trim();
  }

  getPromptPreset(key) {
    this.ensureDefaultPromptPresets();
    const row = this.db.prepare('SELECT * FROM ai_prompt_presets WHERE key = ?').get(key);
    return this.rowToPreset(row);
  }

  setPromptPreset(key, label, content, updatedBy) {
    this.ensureDefaultPromptPresets();
    this.db
      .prepare(
        `INSERT INTO ai_prompt_presets (key, label, content, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
          label = excluded.label,
          content = excluded.content,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`
      )
      .run(key, label || key, content, updatedBy || null, now());
    return this.getPromptPreset(key);
  }

  listPromptPresets() {
    this.ensureDefaultPromptPresets();
    return this.db
      .prepare('SELECT * FROM ai_prompt_presets ORDER BY key ASC')
      .all()
      .map((row) => this.rowToPreset(row));
  }

  getAiPrompt(scopeType, scopeId, name = 'default') {
    const row = this.db
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE scope_type = ? AND scope_id = ? AND name = ? AND active = 1
         ORDER BY version DESC
         LIMIT 1`
      )
      .get(scopeType, this.normalizePromptScope(scopeType, scopeId), name || 'default');
    return this.rowToPrompt(row);
  }

  setAiPrompt(record) {
    const scopeId = this.normalizePromptScope(record.scopeType, record.scopeId);
    const name = record.name || 'default';
    const versionRow = this.db
      .prepare(
        `SELECT COALESCE(MAX(version), 0) AS version
         FROM ai_prompts
         WHERE scope_type = ? AND scope_id = ? AND name = ?`
      )
      .get(record.scopeType, scopeId, name);
    const version = Number(versionRow.version || 0) + 1;

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          `UPDATE ai_prompts
           SET active = 0
           WHERE scope_type = ? AND scope_id = ? AND name = ?`
        )
        .run(record.scopeType, scopeId, name);

      this.db
        .prepare(
          `INSERT INTO ai_prompts
           (scope_type, scope_id, name, content, preset_key, version, active, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          record.scopeType,
          scopeId,
          name,
          record.content,
          record.presetKey || null,
          version,
          record.createdBy || null,
          now()
        );
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }

    return this.getAiPrompt(record.scopeType, scopeId, name);
  }

  listAiPromptHistory(scopeType, scopeId, name = 'default', limit = 10) {
    return this.db
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE scope_type = ? AND scope_id = ? AND name = ?
         ORDER BY version DESC
         LIMIT ?`
      )
      .all(
        scopeType,
        this.normalizePromptScope(scopeType, scopeId),
        name || 'default',
        Math.max(1, Math.min(limit, 25))
      )
      .map((row) => this.rowToPrompt(row));
  }

  rollbackAiPrompt(scopeType, scopeId, name, version, userId) {
    const row = this.db
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE scope_type = ? AND scope_id = ? AND name = ? AND version = ?`
      )
      .get(scopeType, this.normalizePromptScope(scopeType, scopeId), name || 'default', Number(version));
    if (!row) return null;
    return this.setAiPrompt({
      scopeType,
      scopeId: row.scope_id,
      name: row.name,
      content: row.content,
      presetKey: row.preset_key,
      createdBy: userId
    });
  }

  listActiveAiPrompts(scopeType = null, scopeId = null, limit = 25) {
    if (scopeType) {
      return this.db
        .prepare(
          `SELECT * FROM ai_prompts
           WHERE scope_type = ? AND scope_id = ? AND active = 1
           ORDER BY name ASC
           LIMIT ?`
        )
        .all(scopeType, this.normalizePromptScope(scopeType, scopeId), Math.max(1, Math.min(limit, 100)))
        .map((row) => this.rowToPrompt(row));
    }

    return this.db
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE active = 1
         ORDER BY scope_type ASC, scope_id ASC, name ASC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(limit, 100)))
      .map((row) => this.rowToPrompt(row));
  }
}

module.exports = {
  BotDatabase,
  DEFAULT_GUILD_CONFIG
};
