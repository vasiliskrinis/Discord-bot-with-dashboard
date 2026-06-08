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
  restriction_appeals_channel: null,
  roblox_updates_channel: null,
  executor_updates_channel: null,
  update_ping_role: null,
  verification_channel: null,
  verified_role: null,
  verification_message: 'Press the button below to verify and unlock the server.',
  restriction_exempt_channels: [],
  bump_channel: null,
  bump_ping_role: null,
  bump_cooldown_minutes: 120,
  qna_channel: null,
  qna_personality: 'Accurate, friendly, and concise. Act like a calm Discord support assistant. Answer only when you are confident, ask for details when needed, and keep the configured personality consistent.',
  swat_guess_role: null,
  swat_case_channel_name: '📺┃𝗦𝘄𝗮𝘁 𝗖𝗮𝘀𝗲',
  swat_game_channel_name: '📺┃𝗦𝘄𝗮𝘁 𝗚𝗮𝗺𝗲',
  swat_guess_channel_name: '📺┃𝗦𝘄𝗮𝘁 𝗚𝘂𝗲𝘀𝘀',
  swat_case_category: null,
  swat_game_category: null,
  swat_guess_category: null,
  auto_role: null,
  status_role: null,
  status_role_text: null,
  counting_channel: null,
  welcome_channel: null,
  welcome_message: 'Welcome {user} to {server}. You are member #{memberCount}.',
  achievement_channel: null,
  invite_role_mappings: [],
  invite_count_role_rewards: [],
  member_count_voice: null,
  staff_command_roles: [],
  head_of_operations_role: null,
  staff_members_logs_channel: null,
  staff_application_review_channel: null,
  staff_duty_channel: null,
  staff_on_duty_role: null,
  staff_off_duty_role: null,
  internal_affairs_channel: null,
  incident_reports_channel: null,
  staff_application_requirements: 'Minimum age: 16+\nClean moderation history\nProfessional attitude\nAble to follow the Chain of Command\nMust understand SWAT server rules and procedures',
  staff_application_questions: [
    'Why do you want to join Operations Command?',
    'What timezone are you in and when are you active?',
    'What moderation or leadership experience do you have?',
    'How would you handle a heated ticket or report?',
    'Why should Command Staff trust you with staff access?'
  ],
  embed_style: 'sapphire',
  admin_users: [],
  admin_roles: [],
  moderator_users: [],
  moderator_roles: [],
  moderation_command_roles: [],
  authorized_roles: [],
  ai_moderation_enabled: true,
  anti_raid_enabled: true,
  anti_raid_join_limit: 6,
  anti_raid_window_seconds: 20,
  anti_raid_action: 'restrict',
  bot_add_guard_enabled: true,
  economy_enabled: true,
  achievements_enabled: true,
  leveling_enabled: true,
  xp_per_message_min: 12,
  xp_per_message_max: 22,
  level_announce_channel: null,
  role_level_rewards: [],
  sticky: null
};

const LEGACY_GUILD_CONFIG_MIGRATIONS = {
  staff_logs_channel: 'staff_members_logs_channel'
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

function hasConfigValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function processIsAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function releaseDatabaseLock(lockPath, pid) {
  const owner = readLockOwner(lockPath);
  if (owner?.pid === pid) {
    fs.unlinkSync(lockPath);
  }
}

function acquireDatabaseLock(filePath) {
  const lockPath = `${filePath}.lock`;
  const owner = readLockOwner(lockPath);
  if (owner?.pid && owner.pid !== process.pid && processIsAlive(owner.pid)) {
    throw new Error(`Another bot process is already using this database (PID ${owner.pid}). Stop it before starting a second copy.`);
  }

  if (owner) {
    fs.unlinkSync(lockPath);
  }

  const fd = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now(), filePath }));
  fs.closeSync(fd);

  const release = () => {
    try {
      releaseDatabaseLock(lockPath, process.pid);
    } catch {
      // Best-effort cleanup only; stale locks are checked on the next start.
    }
  };
  process.once('exit', release);
  process.once('SIGINT', () => {
    release();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    release();
    process.exit(143);
  });
  return release;
}

class BotDatabase {
  constructor(filePath) {
    const resolved = filePath === ':memory:' ? ':memory:' : path.resolve(process.cwd(), filePath);
    this.filePath = resolved;
    if (resolved !== ':memory:') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      this.releaseLock = acquireDatabaseLock(resolved);
    }
    this.db = new DatabaseSync(resolved);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
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
        mode TEXT NOT NULL DEFAULT 'thread',
        panel_content TEXT,
        button_label TEXT,
        button_style TEXT,
        button_emoji TEXT,
        open_message TEXT,
        close_button_label TEXT,
        delete_button_label TEXT,
        panel_channel_id TEXT,
        panel_message_id TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, panel_id)
      );

      CREATE TABLE IF NOT EXISTS role_reaction_panels (
        guild_id TEXT NOT NULL,
        panel_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        title TEXT,
        description TEXT,
        content TEXT,
        source TEXT NOT NULL DEFAULT 'bot',
        remove_on_unreact INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, panel_id)
      );

      CREATE TABLE IF NOT EXISTS role_reaction_options (
        guild_id TEXT NOT NULL,
        panel_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        emoji_key TEXT NOT NULL,
        role_id TEXT NOT NULL,
        label TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, panel_id, emoji_key)
      );

      CREATE INDEX IF NOT EXISTS idx_role_reaction_message
        ON role_reaction_panels (guild_id, channel_id, message_id);

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

      CREATE TABLE IF NOT EXISTS invite_joins (
        guild_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        inviter_id TEXT,
        invite_code TEXT,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS member_progress (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        balance INTEGER NOT NULL DEFAULT 0,
        daily_streak INTEGER NOT NULL DEFAULT 0,
        last_daily_at INTEGER,
        last_xp_at INTEGER,
        messages INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS member_achievements (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        earned_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, key)
      );

      CREATE TABLE IF NOT EXISTS staff_applications (
        guild_id TEXT NOT NULL,
        application_id INTEGER NOT NULL,
        applicant_id TEXT NOT NULL,
        answers TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        reviewer_id TEXT,
        reviewer_notes TEXT,
        submitted_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, application_id)
      );

      CREATE INDEX IF NOT EXISTS idx_staff_applications_status
        ON staff_applications (guild_id, status, submitted_at);

      CREATE TABLE IF NOT EXISTS staff_profiles (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rank_key TEXT NOT NULL DEFAULT 'probationary_officer',
        tickets_handled INTEGER NOT NULL DEFAULT 0,
        reports_handled INTEGER NOT NULL DEFAULT 0,
        warnings_issued INTEGER NOT NULL DEFAULT 0,
        timeouts_issued INTEGER NOT NULL DEFAULT 0,
        events_hosted INTEGER NOT NULL DEFAULT 0,
        cases_handled INTEGER NOT NULL DEFAULT 0,
        duty_time_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS staff_rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_rank_key TEXT,
        new_rank_key TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_staff_rank_history_user
        ON staff_rank_history (guild_id, user_id, created_at);

      CREATE TABLE IF NOT EXISTS staff_duty_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_staff_duty_sessions_user
        ON staff_duty_sessions (guild_id, user_id, started_at);

      CREATE TABLE IF NOT EXISTS staff_loa_requests (
        guild_id TEXT NOT NULL,
        loa_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        reason TEXT NOT NULL,
        duration_ms INTEGER,
        start_at INTEGER NOT NULL,
        end_at INTEGER,
        reviewer_id TEXT,
        review_notes TEXT,
        created_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, loa_id)
      );

      CREATE INDEX IF NOT EXISTS idx_staff_loa_requests_user
        ON staff_loa_requests (guild_id, user_id, status, created_at);

      CREATE TABLE IF NOT EXISTS staff_mod_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        note TEXT,
        duration_ms INTEGER,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_staff_mod_history_user
        ON staff_mod_history (guild_id, user_id, created_at);

      CREATE TABLE IF NOT EXISTS staff_ia_cases (
        guild_id TEXT NOT NULL,
        ia_id INTEGER NOT NULL,
        reporter_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        investigator_id TEXT,
        status TEXT NOT NULL DEFAULT 'Open',
        summary TEXT NOT NULL,
        evidence TEXT,
        notes TEXT,
        outcome TEXT,
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, ia_id)
      );

      CREATE TABLE IF NOT EXISTS staff_cases (
        guild_id TEXT NOT NULL,
        staff_case_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        target_id TEXT,
        assigned_to TEXT,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        notes TEXT,
        outcome TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        closed_by TEXT,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, staff_case_id)
      );

      CREATE TABLE IF NOT EXISTS staff_incidents (
        guild_id TEXT NOT NULL,
        incident_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        involved_users TEXT NOT NULL DEFAULT '[]',
        evidence TEXT NOT NULL DEFAULT '[]',
        outcome TEXT,
        status TEXT NOT NULL DEFAULT 'Open',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        closed_by TEXT,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, incident_id)
      );

      CREATE TABLE IF NOT EXISTS staff_awards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        award_key TEXT NOT NULL,
        award_label TEXT NOT NULL,
        awarded_by TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staff_action_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        target_id TEXT,
        reference_type TEXT,
        reference_id TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    this.ensureColumn('ticket_panels', 'mode', "TEXT NOT NULL DEFAULT 'thread'");
    this.ensureColumn('ticket_panels', 'panel_content', 'TEXT');
    this.ensureColumn('ticket_panels', 'button_label', 'TEXT');
    this.ensureColumn('ticket_panels', 'button_style', 'TEXT');
    this.ensureColumn('ticket_panels', 'button_emoji', 'TEXT');
    this.ensureColumn('ticket_panels', 'open_message', 'TEXT');
    this.ensureColumn('ticket_panels', 'close_button_label', 'TEXT');
    this.ensureColumn('ticket_panels', 'delete_button_label', 'TEXT');
    this.ensureColumn('ticket_panels', 'panel_channel_id', 'TEXT');
    this.ensureColumn('ticket_panels', 'panel_message_id', 'TEXT');
    this.ensureDefaultPromptPresets();
  }

  ensureColumn(table, column, definition) {
    const existing = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
    this.migrateLegacyGuildConfig(guildId);
  }

  migrateLegacyGuildConfig(guildId) {
    for (const [legacyKey, targetKey] of Object.entries(LEGACY_GUILD_CONFIG_MIGRATIONS)) {
      const legacy = this.db
        .prepare('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?')
        .get(guildId, legacyKey);
      if (!legacy) continue;

      const target = this.db
        .prepare('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?')
        .get(guildId, targetKey);
      const legacyValue = decode(legacy.value);
      const targetValue = target ? decode(target.value) : null;

      if (hasConfigValue(legacyValue) && !hasConfigValue(targetValue)) {
        this.setConfig(guildId, targetKey, legacyValue);
      }

      this.deleteConfig(guildId, legacyKey);
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

  recordInviteJoin(guildId, memberId, inviterId, inviteCode, joinedAt = now()) {
    this.db
      .prepare(
        `INSERT INTO invite_joins (guild_id, member_id, inviter_id, invite_code, joined_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, member_id) DO UPDATE SET
          inviter_id = excluded.inviter_id,
          invite_code = excluded.invite_code,
          joined_at = excluded.joined_at`
      )
      .run(guildId, memberId, inviterId || null, inviteCode || null, joinedAt);
  }

  inviteStats(guildId, inviterId, limit = 10) {
    const rows = this.db
      .prepare(
        `SELECT * FROM invite_joins
         WHERE guild_id = ? AND inviter_id = ?
         ORDER BY joined_at DESC
         LIMIT ?`
      )
      .all(guildId, inviterId, Math.max(1, Math.min(limit, 25)));
    const total = this.db
      .prepare('SELECT COUNT(*) AS count FROM invite_joins WHERE guild_id = ? AND inviter_id = ?')
      .get(guildId, inviterId).count;
    const codes = this.db
      .prepare(
        `SELECT invite_code, COUNT(*) AS count, MAX(joined_at) AS last_joined_at
         FROM invite_joins
         WHERE guild_id = ? AND inviter_id = ?
         GROUP BY invite_code
         ORDER BY count DESC, last_joined_at DESC`
      )
      .all(guildId, inviterId);
    return { total, recent: rows, codes };
  }

  resetInviteStats(guildId, inviterId = null) {
    const result = inviterId
      ? this.db.prepare('DELETE FROM invite_joins WHERE guild_id = ? AND inviter_id = ?').run(guildId, inviterId)
      : this.db.prepare('DELETE FROM invite_joins WHERE guild_id = ?').run(guildId);
    return Number(result.changes || 0);
  }

  ensureMemberProgress(guildId, userId) {
    const existing = this.getMemberProgress(guildId, userId);
    if (existing) return existing;
    this.db
      .prepare(
        `INSERT INTO member_progress
         (guild_id, user_id, xp, level, balance, daily_streak, last_daily_at, last_xp_at, messages, updated_at)
         VALUES (?, ?, 0, 1, 0, 0, NULL, NULL, 0, ?)`
      )
      .run(guildId, userId, now());
    return this.getMemberProgress(guildId, userId);
  }

  getMemberProgress(guildId, userId) {
    return this.db
      .prepare('SELECT * FROM member_progress WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) || null;
  }

  memberProgressRank(guildId, userId, sort = 'xp') {
    const current = this.ensureMemberProgress(guildId, userId);
    const column = sort === 'balance' ? 'balance' : 'xp';
    const value = Number(current[column] || 0);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM member_progress WHERE guild_id = ? AND ${column} > ?`)
      .get(guildId, value);
    return Number(row?.count || 0) + 1;
  }

  addMemberProgress(guildId, userId, updates = {}) {
    const current = this.ensureMemberProgress(guildId, userId);
    const next = {
      xp: Math.max(0, Number(current.xp || 0) + Number(updates.xp || 0)),
      level: Math.max(1, Number(updates.level ?? current.level ?? 1)),
      balance: Math.max(0, Number(current.balance || 0) + Number(updates.balance || 0)),
      daily_streak: Number(updates.dailyStreak ?? current.daily_streak ?? 0),
      last_daily_at: updates.lastDailyAt ?? current.last_daily_at,
      last_xp_at: updates.lastXpAt ?? current.last_xp_at,
      messages: Math.max(0, Number(current.messages || 0) + Number(updates.messages || 0))
    };
    this.db
      .prepare(
        `UPDATE member_progress
         SET xp = ?, level = ?, balance = ?, daily_streak = ?, last_daily_at = ?,
             last_xp_at = ?, messages = ?, updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      )
      .run(
        next.xp,
        next.level,
        next.balance,
        next.daily_streak,
        next.last_daily_at || null,
        next.last_xp_at || null,
        next.messages,
        now(),
        guildId,
        userId
      );
    return this.getMemberProgress(guildId, userId);
  }

  setMemberProgress(guildId, userId, fields = {}) {
    const current = this.ensureMemberProgress(guildId, userId);
    const next = {
      xp: fields.xp ?? current.xp,
      level: fields.level ?? current.level,
      balance: fields.balance ?? current.balance,
      daily_streak: fields.dailyStreak ?? current.daily_streak,
      last_daily_at: fields.lastDailyAt ?? current.last_daily_at,
      last_xp_at: fields.lastXpAt ?? current.last_xp_at,
      messages: fields.messages ?? current.messages
    };
    this.db
      .prepare(
        `UPDATE member_progress
         SET xp = ?, level = ?, balance = ?, daily_streak = ?, last_daily_at = ?,
             last_xp_at = ?, messages = ?, updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      )
      .run(
        Number(next.xp || 0),
        Math.max(1, Number(next.level || 1)),
        Math.max(0, Number(next.balance || 0)),
        Math.max(0, Number(next.daily_streak || 0)),
        next.last_daily_at || null,
        next.last_xp_at || null,
        Math.max(0, Number(next.messages || 0)),
        now(),
        guildId,
        userId
      );
    return this.getMemberProgress(guildId, userId);
  }

  listProgressLeaderboard(guildId, sort = 'xp', limit = 10) {
    const column = sort === 'balance' ? 'balance' : 'xp';
    return this.db
      .prepare(
        `SELECT * FROM member_progress
         WHERE guild_id = ?
         ORDER BY ${column} DESC, level DESC, messages DESC
         LIMIT ?`
      )
      .all(guildId, Math.max(1, Math.min(limit, 25)));
  }

  addAchievement(guildId, userId, key) {
    const before = this.db
      .prepare('SELECT 1 FROM member_achievements WHERE guild_id = ? AND user_id = ? AND key = ?')
      .get(guildId, userId, key);
    if (before) return false;
    this.db
      .prepare(
        'INSERT INTO member_achievements (guild_id, user_id, key, earned_at) VALUES (?, ?, ?, ?)'
      )
      .run(guildId, userId, key, now());
    return true;
  }

  listAchievements(guildId, userId) {
    return this.db
      .prepare(
        `SELECT * FROM member_achievements
         WHERE guild_id = ? AND user_id = ?
         ORDER BY earned_at ASC`
      )
      .all(guildId, userId);
  }

  tableNames(schema = 'main', includeInternal = false) {
    const internalFilter = includeInternal ? '' : "AND name NOT LIKE 'sqlite_%'";
    return this.db
      .prepare(`SELECT name FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'table' ${internalFilter} ORDER BY name ASC`)
      .all()
      .map((row) => row.name);
  }

  tableColumns(table, schema = 'main') {
    return this.db
      .prepare(`PRAGMA ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`)
      .all();
  }

  databaseStats() {
    const tables = this.tableNames();
    const counts = {};
    for (const table of tables) {
      counts[table] = this.db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count;
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

  importFromBackup(filePath, options = {}) {
    if (this.filePath === ':memory:') throw new Error('Can not import a backup into an in-memory database.');

    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('Backup file does not exist.');
    }
    if (path.resolve(this.filePath) === resolved) {
      throw new Error('Can not import the active database file into itself.');
    }

    const safetyBackupPath = options.safetyBackupPath === false
      ? null
      : this.backupTo(options.safetyBackupPath || path.join('data', 'backups', `pre-import-${now()}.sqlite`));
    const schema = `backup_${now()}`;
    const escapedPath = resolved.replaceAll("'", "''");
    const imports = [];
    const previousForeignKeys = Boolean(this.db.prepare('PRAGMA foreign_keys').get().foreign_keys);

    this.db.exec(`ATTACH DATABASE '${escapedPath}' AS ${quoteIdentifier(schema)};`);
    try {
      const currentTables = this.tableNames('main');
      const backupTables = new Set(this.tableNames(schema));
      const missingTables = currentTables.filter((table) => !backupTables.has(table));
      if (missingTables.length) {
        throw new Error(`Backup is missing required table(s): ${missingTables.join(', ')}.`);
      }

      this.db.exec('PRAGMA foreign_keys = OFF;');
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        for (const table of currentTables) {
          const currentColumns = this.tableColumns(table, 'main');
          const backupColumns = new Set(this.tableColumns(table, schema).map((column) => column.name));
          const importColumns = currentColumns
            .filter((column) => backupColumns.has(column.name))
            .map((column) => column.name);
          const missingRequiredColumns = currentColumns
            .filter((column) => !backupColumns.has(column.name) && column.notnull && column.dflt_value === null && !column.pk)
            .map((column) => column.name);

          if (missingRequiredColumns.length) {
            throw new Error(`Backup table ${table} is missing required column(s): ${missingRequiredColumns.join(', ')}.`);
          }

          this.db.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
          if (!importColumns.length) {
            imports.push({ table, rows: 0 });
            continue;
          }

          const columnList = importColumns.map(quoteIdentifier).join(', ');
          const result = this.db
            .prepare(`INSERT INTO ${quoteIdentifier(table)} (${columnList}) SELECT ${columnList} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`)
            .run();
          imports.push({ table, rows: Number(result.changes || 0) });
        }

        this.importSqliteSequence(schema);
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      } finally {
        this.db.exec(`PRAGMA foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'};`);
      }
    } finally {
      this.db.exec(`DETACH DATABASE ${quoteIdentifier(schema)};`);
    }

    this.ensureDefaultPromptPresets();
    return {
      filePath: resolved,
      safetyBackupPath,
      tables: imports,
      database: this.databaseStats()
    };
  }

  importSqliteSequence(schema) {
    const currentInternal = new Set(this.tableNames('main', true));
    const backupInternal = new Set(this.tableNames(schema, true));
    if (!currentInternal.has('sqlite_sequence') || !backupInternal.has('sqlite_sequence')) return;

    this.db.prepare('DELETE FROM sqlite_sequence').run();
    this.db
      .prepare(`INSERT INTO sqlite_sequence (name, seq) SELECT name, seq FROM ${quoteIdentifier(schema)}.${quoteIdentifier('sqlite_sequence')}`)
      .run();
  }

  saveTicketPanel(guildId, panel) {
    this.db
      .prepare(
        `INSERT INTO ticket_panels
         (
          guild_id, panel_id, name, description, category_id, support_role_id,
          mode, panel_content, button_label, button_style, button_emoji,
          open_message, close_button_label, delete_button_label, panel_channel_id, panel_message_id,
          created_by, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, panel_id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          category_id = excluded.category_id,
          support_role_id = excluded.support_role_id,
          mode = excluded.mode,
          panel_content = excluded.panel_content,
          button_label = excluded.button_label,
          button_style = excluded.button_style,
          button_emoji = excluded.button_emoji,
          open_message = excluded.open_message,
          close_button_label = excluded.close_button_label,
          delete_button_label = excluded.delete_button_label,
          panel_channel_id = excluded.panel_channel_id,
          panel_message_id = excluded.panel_message_id`
      )
      .run(
        guildId,
        panel.panelId,
        panel.name,
        panel.description || null,
        panel.categoryId || null,
        panel.supportRoleId || null,
        panel.mode || 'thread',
        panel.panelContent || null,
        panel.buttonLabel || null,
        panel.buttonStyle || null,
        panel.buttonEmoji || null,
        panel.openMessage || null,
        panel.closeButtonLabel || null,
        panel.deleteButtonLabel || null,
        panel.panelChannelId || null,
        panel.panelMessageId || null,
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

  saveRoleReactionPanel(guildId, panel, options = []) {
    this.db.exec('BEGIN;');
    try {
      this.db
        .prepare(
          `INSERT INTO role_reaction_panels
           (
            guild_id, panel_id, channel_id, message_id, title, description, content,
            source, remove_on_unreact, created_by, created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(guild_id, panel_id) DO UPDATE SET
            channel_id = excluded.channel_id,
            message_id = excluded.message_id,
            title = excluded.title,
            description = excluded.description,
            content = excluded.content,
            source = excluded.source,
            remove_on_unreact = excluded.remove_on_unreact`
        )
        .run(
          guildId,
          panel.panelId,
          panel.channelId,
          panel.messageId,
          panel.title || null,
          panel.description || null,
          panel.content || null,
          panel.source || 'bot',
          panel.removeOnUnreact === false ? 0 : 1,
          panel.createdBy || null,
          panel.createdAt || now()
        );

      this.db
        .prepare('DELETE FROM role_reaction_options WHERE guild_id = ? AND panel_id = ?')
        .run(guildId, panel.panelId);
      const insert = this.db.prepare(
        `INSERT INTO role_reaction_options
         (guild_id, panel_id, emoji, emoji_key, role_id, label, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      options.forEach((option, index) => {
        insert.run(
          guildId,
          panel.panelId,
          option.emoji,
          option.emojiKey,
          option.roleId,
          option.label || null,
          Number.isFinite(option.position) ? option.position : index
        );
      });
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  getRoleReactionPanel(guildId, panelId) {
    return this.db
      .prepare('SELECT * FROM role_reaction_panels WHERE guild_id = ? AND panel_id = ?')
      .get(guildId, panelId);
  }

  getRoleReactionPanelByMessage(guildId, channelId, messageId) {
    return this.db
      .prepare('SELECT * FROM role_reaction_panels WHERE guild_id = ? AND channel_id = ? AND message_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(guildId, channelId, messageId);
  }

  listRoleReactionPanels(guildId) {
    return this.db
      .prepare('SELECT * FROM role_reaction_panels WHERE guild_id = ? ORDER BY created_at DESC')
      .all(guildId);
  }

  listRoleReactionOptions(guildId, panelId) {
    return this.db
      .prepare('SELECT * FROM role_reaction_options WHERE guild_id = ? AND panel_id = ? ORDER BY position ASC, emoji ASC')
      .all(guildId, panelId);
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
