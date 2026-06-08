const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { buildEmbed, success } = require('../embeds');
const { formatDuration, parseDuration } = require('../time');
const { canManageStaffSystem, canUseStaffSystem, requireStaff, requireStaffManager } = require('../permissions');
const { systemLog } = require('./logger');

const STAFF_RANKS = [
  { key: 'probationary_officer', label: '🎓 Probationary Officer' },
  { key: 'officer', label: '👮 Officer' },
  { key: 'senior_officer', label: '🚔 Senior Officer' },
  { key: 'sergeant', label: '🎖️ Sergeant' },
  { key: 'lieutenant', label: '📡 Lieutenant' },
  { key: 'captain', label: '🛡️ Captain' },
  { key: 'commander', label: '⭐ Commander' },
  { key: 'chief_of_police', label: '👑 Chief of Police' }
];

const STAFF_AWARDS = [
  { key: 'staff_member_month', label: '🏆 Staff Member of the Month' },
  { key: 'most_active_staff', label: '🎯 Most Active Staff' },
  { key: 'best_supervisor', label: '📡 Best Supervisor' },
  { key: 'best_moderator', label: '🚔 Best Moderator' },
  { key: 'best_investigator', label: '🔍 Best Investigator' }
];

const STAT_COLUMNS = {
  tickets: 'tickets_handled',
  reports: 'reports_handled',
  warnings: 'warnings_issued',
  timeouts: 'timeouts_issued',
  events: 'events_hosted',
  cases: 'cases_handled',
  duty: 'duty_time_ms'
};

const STAFF_CASE_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical']);
const LOA_STATUSES = new Set(['Pending', 'Approved', 'Denied', 'Ended']);

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

function clampText(value, max = 1024, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function userIdFromValue(value) {
  return String(value || '').replace(/[<@!>]/g, '').trim();
}

function userMention(userId) {
  return userId ? `<@${userId}>` : 'Unknown';
}

function rankByKey(key) {
  return STAFF_RANKS.find((rank) => rank.key === key) || STAFF_RANKS[0];
}

function rankIndex(key) {
  const index = STAFF_RANKS.findIndex((rank) => rank.key === key);
  return index >= 0 ? index : 0;
}

function awardByKey(key) {
  return STAFF_AWARDS.find((award) => award.key === key) || STAFF_AWARDS[0];
}

function nextStaffId(db, guildId, stateKey) {
  const current = Number(db.getState(guildId, stateKey, 1));
  db.setState(guildId, stateKey, current + 1);
  return current;
}

function applicationQuestions(db, guildId) {
  const fallback = [
    'Why do you want to join Operations Command?',
    'What timezone are you in and when are you active?',
    'What moderation or leadership experience do you have?',
    'How would you handle a heated ticket or report?',
    'Why should Command Staff trust you with staff access?'
  ];
  const configured = db.getConfig(guildId, 'staff_application_questions', fallback);
  const questions = (Array.isArray(configured) ? configured : fallback)
    .map((question) => clampText(question, 90))
    .filter(Boolean)
    .slice(0, 5);
  return questions.length ? questions : fallback;
}

function requirementsText(db, guildId) {
  return clampText(
    db.getConfig(guildId, 'staff_application_requirements', ''),
    3900,
    'Command Staff has not posted requirements yet.'
  );
}

function ensureProfile(db, guildId, userId) {
  const time = now();
  db.db
    .prepare(
      `INSERT OR IGNORE INTO staff_profiles
       (guild_id, user_id, rank_key, created_at, updated_at)
       VALUES (?, ?, 'probationary_officer', ?, ?)`
    )
    .run(guildId, userId, time, time);
  return getProfile(db, guildId, userId);
}

function getProfile(db, guildId, userId) {
  return db.db
    .prepare('SELECT * FROM staff_profiles WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) || null;
}

function incrementStaffStat(db, guildId, userId, stat, amount = 1) {
  if (!userId) return null;
  const column = STAT_COLUMNS[stat];
  if (!column) return null;
  ensureProfile(db, guildId, userId);
  db.db
    .prepare(`UPDATE staff_profiles SET ${column} = ${column} + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
    .run(Math.max(0, Number(amount || 0)), now(), guildId, userId);
  return getProfile(db, guildId, userId);
}

function listStaffProfiles(db, guildId, limit = 10) {
  return db.db
    .prepare(
      `SELECT * FROM staff_profiles
       WHERE guild_id = ?
       ORDER BY cases_handled DESC, reports_handled DESC, duty_time_ms DESC, warnings_issued DESC
       LIMIT ?`
    )
    .all(guildId, Math.max(1, Math.min(limit, 25)));
}

function insertActionLog(db, guildId, action) {
  db.db
    .prepare(
      `INSERT INTO staff_action_logs
       (guild_id, actor_id, action, target_id, reference_type, reference_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      guildId,
      action.actorId || null,
      action.action,
      action.targetId || null,
      action.referenceType || null,
      action.referenceId ? String(action.referenceId) : null,
      action.details || null,
      now()
    );
}

async function sendConfiguredEmbed(db, guild, key, embed) {
  const channelId = db.getConfig(guild.id, key);
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

async function logStaffAction(db, guild, options = {}) {
  insertActionLog(db, guild.id, {
    actorId: options.actorId,
    action: options.action || options.title || 'Staff Action',
    targetId: options.targetId,
    referenceType: options.referenceType,
    referenceId: options.referenceId,
    details: options.details
  });

  const fields = [
    options.actorId ? { name: 'Command Staff', value: userMention(options.actorId), inline: true } : null,
    options.targetId ? { name: 'Subject', value: userMention(options.targetId), inline: true } : null,
    options.referenceId ? { name: 'Reference', value: `${options.referenceType || 'Case'} #${options.referenceId}`, inline: true } : null,
    ...(options.fields || [])
  ].filter(Boolean);

  const embed = buildEmbed(db, guild.id, {
    title: options.title || 'SWAT Staff Action',
    description: options.details ? clampText(options.details, 3900) : undefined,
    fields,
    style: options.style || 'cyber'
  });

  const staffChannel = db.getConfig(guild.id, 'staff_members_logs_channel');
  const advancedChannel = db.getConfig(guild.id, 'advanced_logs_channel');
  if (staffChannel) {
    await sendConfiguredEmbed(db, guild, 'staff_members_logs_channel', embed);
  }
  if (!staffChannel || staffChannel !== advancedChannel) {
    await systemLog(db, guild, 'staff', {
      title: options.title || 'SWAT Staff Action',
      description: options.details,
      fields,
      style: options.style || 'cyber'
    }).catch(() => null);
  }
}

function applicationRow(app) {
  if (!app) return null;
  return {
    ...app,
    answers: decode(app.answers, [])
  };
}

function createApplication(db, guildId, applicantId, answers) {
  const applicationId = nextStaffId(db, guildId, 'next_staff_application_id');
  const time = now();
  db.db
    .prepare(
      `INSERT INTO staff_applications
       (guild_id, application_id, applicant_id, answers, status, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(guildId, applicationId, applicantId, encode(answers), time, time);
  return getApplication(db, guildId, applicationId);
}

function getApplication(db, guildId, applicationId) {
  const row = db.db
    .prepare('SELECT * FROM staff_applications WHERE guild_id = ? AND application_id = ?')
    .get(guildId, Number(applicationId));
  return applicationRow(row);
}

function listApplications(db, guildId, status = 'pending', limit = 10) {
  const bounded = Math.max(1, Math.min(limit, 25));
  const rows = status === 'all'
    ? db.db
        .prepare('SELECT * FROM staff_applications WHERE guild_id = ? ORDER BY submitted_at DESC LIMIT ?')
        .all(guildId, bounded)
    : db.db
        .prepare('SELECT * FROM staff_applications WHERE guild_id = ? AND status = ? ORDER BY submitted_at ASC LIMIT ?')
        .all(guildId, status, bounded);
  return rows.map(applicationRow);
}

function updateApplicationStatus(db, guildId, applicationId, status, reviewerId, notes) {
  db.db
    .prepare(
      `UPDATE staff_applications
       SET status = ?, reviewer_id = ?, reviewer_notes = ?, reviewed_at = ?, updated_at = ?
       WHERE guild_id = ? AND application_id = ?`
    )
    .run(status, reviewerId, notes || null, now(), now(), guildId, Number(applicationId));
  return getApplication(db, guildId, applicationId);
}

function applicationButtons(applicationId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff-app:accept:${applicationId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`staff-app:deny:${applicationId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function applicationSelectRow(applications) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('staff-app:review')
      .setPlaceholder('Open an application file')
      .addOptions(applications.slice(0, 25).map((app) => ({
        label: `Application #${app.application_id}`,
        value: String(app.application_id),
        description: `${app.status} - ${app.applicant_id}`.slice(0, 100)
      })))
  );
}

function applicationEmbed(db, guildId, app) {
  const answers = app.answers || [];
  return buildEmbed(db, guildId, {
    title: `Staff Application #${app.application_id}`,
    description: `Applicant: ${userMention(app.applicant_id)}\nStatus: **${app.status.toUpperCase()}**\nSubmitted: <t:${Math.floor(app.submitted_at / 1000)}:R>`,
    fields: [
      ...answers.map((entry, index) => ({
        name: `Q${index + 1}. ${clampText(entry.question, 220, 'Question')}`,
        value: clampText(entry.answer, 1024, 'No answer')
      })),
      app.reviewer_id
        ? { name: 'Review', value: `${userMention(app.reviewer_id)} - ${app.reviewer_notes || 'No notes'}` }
        : null
    ].filter(Boolean),
    style: app.status === 'accepted' ? 'emerald' : app.status === 'denied' ? 'ruby' : 'royal'
  });
}

function applicationModal(db, guildId) {
  const questions = applicationQuestions(db, guildId);
  const modal = new ModalBuilder()
    .setCustomId('staff-apply')
    .setTitle('SWAT Staff Application');

  for (const [index, question] of questions.entries()) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${index}`)
          .setLabel(question)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(900)
      )
    );
  }

  return modal;
}

function reviewNotesModal(action, applicationId) {
  return new ModalBuilder()
    .setCustomId(`staff-app-note:${action}:${applicationId}`)
    .setTitle(action === 'accept' ? 'Accept Application' : 'Deny Application')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Optional review notes')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(900)
      )
    );
}

async function sendApplicationReviewLog(db, guild, app) {
  const channelId = db.getConfig(guild.id, 'staff_application_review_channel') ||
    db.getConfig(guild.id, 'staff_members_logs_channel');
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send({
    embeds: [applicationEmbed(db, guild.id, app)],
    components: app.status === 'pending' ? [applicationButtons(app.application_id)] : [],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function reviewApplication(db, interaction, applicationId, status, notes = '') {
  requireStaffManager(db, interaction.member);
  const app = getApplication(db, interaction.guild.id, applicationId);
  if (!app) throw new Error('Application file not found.');
  if (app.status !== 'pending') throw new Error(`Application #${app.application_id} is already ${app.status}.`);

  const next = updateApplicationStatus(db, interaction.guild.id, applicationId, status, interaction.user.id, notes);
  if (status === 'accepted') ensureProfile(db, interaction.guild.id, app.applicant_id);

  await logStaffAction(db, interaction.guild, {
    title: status === 'accepted' ? 'Application Accepted' : 'Application Denied',
    action: `application_${status}`,
    actorId: interaction.user.id,
    targetId: app.applicant_id,
    referenceType: 'Application',
    referenceId: app.application_id,
    details: notes || 'No review notes.',
    style: status === 'accepted' ? 'emerald' : 'ruby'
  });

  const applicant = await interaction.client.users.fetch(app.applicant_id).catch(() => null);
  await applicant?.send({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: status === 'accepted' ? 'Application Accepted' : 'Application Denied',
        description: `Your Operations Command application in **${interaction.guild.name}** was **${status}**.${notes ? `\n\nReview notes: ${notes}` : ''}`,
        style: status === 'accepted' ? 'emerald' : 'ruby'
      })
    ]
  }).catch(() => null);

  return next;
}

function activeDutySession(db, guildId, userId) {
  return db.db
    .prepare(
      `SELECT * FROM staff_duty_sessions
       WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(guildId, userId) || null;
}

function dutyStats(db, guildId, userId, period = 'all') {
  const start = period === 'week'
    ? now() - 7 * 24 * 60 * 60 * 1000
    : period === 'month'
      ? now() - 30 * 24 * 60 * 60 * 1000
      : 0;
  const rows = db.db
    .prepare(
      `SELECT * FROM staff_duty_sessions
       WHERE guild_id = ? AND user_id = ? AND started_at >= ?
       ORDER BY started_at DESC`
    )
    .all(guildId, userId, start);
  const total = rows.reduce((sum, row) => {
    if (row.ended_at) return sum + Number(row.duration_ms || 0);
    return sum + Math.max(0, now() - Number(row.started_at || now()));
  }, 0);
  return { total, sessions: rows.length, active: activeDutySession(db, guildId, userId) };
}

async function sendDutyStatusEmbed(db, interaction, onDuty, duration = 0) {
  const embed = buildEmbed(db, interaction.guild.id, {
    title: onDuty ? 'Duty Status' : 'Duty Status',
    description: onDuty
      ? `🚔 ${interaction.user} is now **On Duty**.\nOperations Command has logged the watch.`
      : `🚓 ${interaction.user} is now **Off Duty**.\nShift duration: **${formatDuration(duration)}**.`,
    style: onDuty ? 'emerald' : 'amber'
  });
  const channelId = db.getConfig(interaction.guild.id, 'staff_duty_channel');
  const channel = channelId
    ? await interaction.guild.channels.fetch(channelId).catch(() => null)
    : interaction.channel;
  if (channel?.isTextBased?.()) {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  }
}

async function syncDutyRoles(db, guild, member, onDuty) {
  if (!member?.roles) return { added: [], removed: [], skipped: [] };
  const addRoleId = db.getConfig(guild.id, onDuty ? 'staff_on_duty_role' : 'staff_off_duty_role');
  const removeRoleId = db.getConfig(guild.id, onDuty ? 'staff_off_duty_role' : 'staff_on_duty_role');
  const result = { added: [], removed: [], skipped: [] };

  if (removeRoleId && member.roles.cache.has(removeRoleId)) {
    const role = await guild.roles.fetch(removeRoleId).catch(() => null);
    if (role && !role.managed && role.editable !== false) {
      await member.roles.remove(role, onDuty ? 'Duty Status changed to On Duty' : 'Duty Status changed to Off Duty')
        .then(() => result.removed.push(role.id))
        .catch(() => result.skipped.push(role.id));
    } else {
      result.skipped.push(removeRoleId);
    }
  }

  if (addRoleId && !member.roles.cache.has(addRoleId)) {
    const role = await guild.roles.fetch(addRoleId).catch(() => null);
    if (role && !role.managed && role.editable !== false) {
      await member.roles.add(role, onDuty ? 'Duty Status changed to On Duty' : 'Duty Status changed to Off Duty')
        .then(() => result.added.push(role.id))
        .catch(() => result.skipped.push(role.id));
    } else {
      result.skipped.push(addRoleId);
    }
  }

  return result;
}

function dutyRoleFields(result) {
  if (!result?.added?.length && !result?.removed?.length && !result?.skipped?.length) return [];
  return [
    result.added.length ? { name: 'Duty Role Added', value: result.added.map((roleId) => `<@&${roleId}>`).join(', '), inline: true } : null,
    result.removed.length ? { name: 'Duty Role Removed', value: result.removed.map((roleId) => `<@&${roleId}>`).join(', '), inline: true } : null,
    result.skipped.length ? { name: 'Duty Role Skipped', value: result.skipped.map((roleId) => `<@&${roleId}>`).join(', '), inline: true } : null
  ].filter(Boolean);
}

async function handleDutySlash(interaction, db) {
  requireStaff(db, interaction.member);
  const sub = interaction.options.getSubcommand();

  if (sub === 'on') {
    if (activeDutySession(db, interaction.guild.id, interaction.user.id)) {
      throw new Error('You are already marked On Duty.');
    }
    ensureProfile(db, interaction.guild.id, interaction.user.id);
    db.db
      .prepare('INSERT INTO staff_duty_sessions (guild_id, user_id, started_at) VALUES (?, ?, ?)')
      .run(interaction.guild.id, interaction.user.id, now());
    const dutyRoles = await syncDutyRoles(db, interaction.guild, interaction.member, true);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, 'Duty Status updated: On Duty.')], ephemeral: true });
    await sendDutyStatusEmbed(db, interaction, true);
    await logStaffAction(db, interaction.guild, {
      title: 'Duty Status: On Duty',
      action: 'duty_on',
      actorId: interaction.user.id,
      targetId: interaction.user.id,
      details: 'Officer is now On Duty.',
      fields: dutyRoleFields(dutyRoles),
      style: 'emerald'
    });
    return true;
  }

  if (sub === 'off') {
    const active = activeDutySession(db, interaction.guild.id, interaction.user.id);
    if (!active) throw new Error('You are not marked On Duty.');
    const duration = Math.max(0, now() - Number(active.started_at || now()));
    db.db
      .prepare('UPDATE staff_duty_sessions SET ended_at = ?, duration_ms = ? WHERE id = ?')
      .run(now(), duration, active.id);
    incrementStaffStat(db, interaction.guild.id, interaction.user.id, 'duty', duration);
    const dutyRoles = await syncDutyRoles(db, interaction.guild, interaction.member, false);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Duty Status updated: Off Duty. Shift: ${formatDuration(duration)}.`)], ephemeral: true });
    await sendDutyStatusEmbed(db, interaction, false, duration);
    await logStaffAction(db, interaction.guild, {
      title: 'Duty Status: Off Duty',
      action: 'duty_off',
      actorId: interaction.user.id,
      targetId: interaction.user.id,
      details: `Shift duration: ${formatDuration(duration)}.`,
      fields: dutyRoleFields(dutyRoles),
      style: 'amber'
    });
    return true;
  }

  const target = interaction.options.getUser('user') || interaction.user;
  if (target.id !== interaction.user.id) requireStaffManager(db, interaction.member);
  const period = interaction.options.getString('period') || 'week';
  const stats = dutyStats(db, interaction.guild.id, target.id, period);
  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Duty Stats - ${target.tag || target.username}`,
        description: [
          `Period: **${period.toUpperCase()}**`,
          `Duty time: **${formatDuration(stats.total)}**`,
          `Sessions: **${stats.sessions}**`,
          `Current status: **${stats.active ? 'On Duty' : 'Off Duty'}**`
        ].join('\n'),
        style: 'cyber'
      })
    ],
    ephemeral: true
  });
  return true;
}

function loaRow(db, guildId, loaId) {
  return db.db
    .prepare('SELECT * FROM staff_loa_requests WHERE guild_id = ? AND loa_id = ?')
    .get(guildId, Number(loaId)) || null;
}

function activeLoaForUser(db, guildId, userId) {
  return db.db
    .prepare(
      `SELECT * FROM staff_loa_requests
       WHERE guild_id = ? AND user_id = ? AND status IN ('Pending', 'Approved')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(guildId, userId) || null;
}

function listLoaRows(db, guildId, status = 'Pending', limit = 10) {
  const bounded = Math.max(1, Math.min(Number(limit || 10), 25));
  if (status === 'All') {
    return db.db
      .prepare('SELECT * FROM staff_loa_requests WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(guildId, bounded);
  }
  return db.db
    .prepare('SELECT * FROM staff_loa_requests WHERE guild_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?')
    .all(guildId, status, bounded);
}

function loaDurationText(row) {
  if (!row?.duration_ms) return 'Open-ended';
  const endText = row.end_at ? `Ends <t:${Math.floor(row.end_at / 1000)}:R>` : 'No end date';
  return `${formatDuration(Number(row.duration_ms))} • ${endText}`;
}

function loaEmbed(db, guildId, row) {
  return buildEmbed(db, guildId, {
    title: `Leave Of Absence #${row.loa_id}`,
    description: `${userMention(row.user_id)} • **${row.status}**`,
    fields: [
      { name: 'Reason', value: clampText(row.reason, 1024, 'No reason provided.') },
      { name: 'Duration', value: loaDurationText(row), inline: true },
      { name: 'Filed', value: `<t:${Math.floor(row.created_at / 1000)}:R>`, inline: true },
      row.reviewer_id ? { name: 'Reviewed By', value: userMention(row.reviewer_id), inline: true } : null,
      row.review_notes ? { name: 'Review Notes', value: clampText(row.review_notes, 1024) } : null
    ].filter(Boolean),
    style: row.status === 'Approved' ? 'emerald' : row.status === 'Denied' ? 'ruby' : row.status === 'Ended' ? 'amber' : 'royal'
  });
}

async function handleLoaSlash(interaction, db) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'request') {
    requireStaff(db, interaction.member);
    const existing = activeLoaForUser(db, interaction.guild.id, interaction.user.id);
    if (existing) throw new Error(`You already have LOA #${existing.loa_id} marked ${existing.status}.`);

    const reason = interaction.options.getString('reason', true);
    const durationRaw = interaction.options.getString('duration');
    const durationMs = durationRaw ? parseDuration(durationRaw) : null;
    if (durationRaw && !durationMs) throw new Error('Use a duration like 3d, 1w, 12h, or leave it blank for open-ended LOA.');

    const loaId = nextStaffId(db, interaction.guild.id, 'next_staff_loa_id');
    const time = now();
    const endAt = durationMs ? time + durationMs : null;
    db.db
      .prepare(
        `INSERT INTO staff_loa_requests
         (guild_id, loa_id, user_id, status, reason, duration_ms, start_at, end_at, created_at, updated_at)
         VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)`
      )
      .run(interaction.guild.id, loaId, interaction.user.id, reason, durationMs, time, endAt, time, time);
    const row = loaRow(db, interaction.guild.id, loaId);

    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Leave Of Absence request #${loaId} filed for Command Staff review.`)], ephemeral: true });
    await logStaffAction(db, interaction.guild, {
      title: 'LOA Request Filed',
      action: 'loa_request',
      actorId: interaction.user.id,
      targetId: interaction.user.id,
      referenceType: 'LOA',
      referenceId: loaId,
      details: reason,
      fields: [{ name: 'Duration', value: loaDurationText(row), inline: true }],
      style: 'royal'
    });
    return true;
  }

  if (sub === 'list') {
    requireStaffManager(db, interaction.member);
    const status = interaction.options.getString('status') || 'Pending';
    const rows = listLoaRows(db, interaction.guild.id, status, 10);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Leave Of Absence Roster',
          description: rows.length
            ? rows.map((row) => `#${row.loa_id} • ${userMention(row.user_id)} • **${row.status}** • ${loaDurationText(row)}\n${clampText(row.reason, 140, 'No reason')}`).join('\n\n')
            : `No ${status.toLowerCase()} LOA records found.`,
          style: 'royal'
        })
      ],
      ephemeral: true
    });
    return true;
  }

  const loaId = interaction.options.getInteger('loa_id');
  let row = loaId ? loaRow(db, interaction.guild.id, loaId) : activeLoaForUser(db, interaction.guild.id, interaction.user.id);
  if (!row) throw new Error('Leave Of Absence record not found.');

  if (sub === 'approve' || sub === 'deny') {
    requireStaffManager(db, interaction.member);
    if (row.status !== 'Pending') throw new Error(`LOA #${row.loa_id} is already ${row.status}.`);
    const status = sub === 'approve' ? 'Approved' : 'Denied';
    const notes = interaction.options.getString('notes') || null;
    db.db
      .prepare(
        `UPDATE staff_loa_requests
         SET status = ?, reviewer_id = ?, review_notes = ?, reviewed_at = ?, updated_at = ?
         WHERE guild_id = ? AND loa_id = ?`
      )
      .run(status, interaction.user.id, notes, now(), now(), interaction.guild.id, row.loa_id);
    row = loaRow(db, interaction.guild.id, row.loa_id);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `LOA #${row.loa_id} ${status.toLowerCase()}.`)], ephemeral: true });
    await logStaffAction(db, interaction.guild, {
      title: status === 'Approved' ? 'LOA Approved' : 'LOA Denied',
      action: `loa_${status.toLowerCase()}`,
      actorId: interaction.user.id,
      targetId: row.user_id,
      referenceType: 'LOA',
      referenceId: row.loa_id,
      details: notes || row.reason,
      fields: [{ name: 'Status', value: status, inline: true }],
      style: status === 'Approved' ? 'emerald' : 'ruby'
    });
    return true;
  }

  if (sub === 'end') {
    if (row.user_id !== interaction.user.id) requireStaffManager(db, interaction.member);
    if (!['Pending', 'Approved'].includes(row.status)) throw new Error(`LOA #${row.loa_id} is already ${row.status}.`);
    const notes = interaction.options.getString('notes') || null;
    db.db
      .prepare(
        `UPDATE staff_loa_requests
         SET status = 'Ended', reviewer_id = ?, review_notes = COALESCE(?, review_notes), reviewed_at = COALESCE(reviewed_at, ?), updated_at = ?
         WHERE guild_id = ? AND loa_id = ?`
      )
      .run(interaction.user.id, notes, now(), now(), interaction.guild.id, row.loa_id);
    row = loaRow(db, interaction.guild.id, row.loa_id);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `LOA #${row.loa_id} ended.`)], ephemeral: true });
    await logStaffAction(db, interaction.guild, {
      title: 'LOA Ended',
      action: 'loa_end',
      actorId: interaction.user.id,
      targetId: row.user_id,
      referenceType: 'LOA',
      referenceId: row.loa_id,
      details: notes || 'Leave Of Absence ended.',
      style: 'amber'
    });
    return true;
  }

  return false;
}

function profileEmbed(db, guildId, user, profile) {
  const rank = rankByKey(profile.rank_key);
  return buildEmbed(db, guildId, {
    title: `Staff Dossier - ${user.tag || user.username || user.id}`,
    description: `Rank: **${rank.label}**`,
    fields: [
      { name: 'Tickets', value: String(profile.tickets_handled), inline: true },
      { name: 'Reports', value: String(profile.reports_handled), inline: true },
      { name: 'Warnings', value: String(profile.warnings_issued), inline: true },
      { name: 'Timeouts', value: String(profile.timeouts_issued), inline: true },
      { name: 'Events', value: String(profile.events_hosted), inline: true },
      { name: 'Cases', value: String(profile.cases_handled), inline: true },
      { name: 'Duty Time', value: formatDuration(Number(profile.duty_time_ms || 0)), inline: true }
    ],
    style: 'cyber'
  });
}

async function handleStaffSlash(interaction, db) {
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  if (sub === 'apply') {
    await interaction.showModal(applicationModal(db, interaction.guild.id));
    return true;
  }

  if (sub === 'requirements') {
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Operations Command Requirements',
          description: requirementsText(db, interaction.guild.id),
          style: 'cyber'
        })
      ],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'applications') {
    requireStaffManager(db, interaction.member);
    const apps = listApplications(db, interaction.guild.id, 'pending', 10);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Staff Review Queue',
          description: apps.length
            ? apps.map((app) => `#${app.application_id} - ${userMention(app.applicant_id)} - <t:${Math.floor(app.submitted_at / 1000)}:R>`).join('\n')
            : 'No pending Operations Command applications.',
          style: 'royal'
        })
      ],
      components: apps.length ? [applicationSelectRow(apps)] : [],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'review') {
    requireStaffManager(db, interaction.member);
    const app = getApplication(db, interaction.guild.id, interaction.options.getInteger('application_id'));
    if (!app) throw new Error('Application file not found.');
    await interaction.reply({
      embeds: [applicationEmbed(db, interaction.guild.id, app)],
      components: app.status === 'pending' ? [applicationButtons(app.application_id)] : [],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'accept' || sub === 'deny') {
    const app = await reviewApplication(
      db,
      interaction,
      interaction.options.getInteger('application_id'),
      sub === 'accept' ? 'accepted' : 'denied',
      interaction.options.getString('notes') || ''
    );
    await interaction.reply({
      embeds: [success(db, interaction.guild.id, `Application #${app.application_id} ${app.status}.`)],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'stats') {
    requireStaff(db, interaction.member);
    const user = interaction.options.getUser('user') || interaction.user;
    if (user.id !== interaction.user.id) requireStaffManager(db, interaction.member);
    const profile = ensureProfile(db, interaction.guild.id, user.id);
    await interaction.reply({ embeds: [profileEmbed(db, interaction.guild.id, user, profile)], ephemeral: true });
    return true;
  }

  if (sub === 'leaderboard') {
    requireStaffManager(db, interaction.member);
    const rows = listStaffProfiles(db, interaction.guild.id, 10);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Operations Command Leaderboard',
          description: rows.length
            ? rows.map((row, index) => `${index + 1}. ${userMention(row.user_id)} - **${row.cases_handled}** cases - **${formatDuration(row.duty_time_ms)}** duty`).join('\n')
            : 'No staff statistics recorded yet.',
          style: 'cyber'
        })
      ],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'event') {
    requireStaffManager(db, interaction.member);
    const user = interaction.options.getUser('user') || interaction.user;
    const title = interaction.options.getString('title') || 'Staff event hosted';
    incrementStaffStat(db, interaction.guild.id, user.id, 'events');
    await logStaffAction(db, interaction.guild, {
      title: 'Staff Event Hosted',
      action: 'staff_event',
      actorId: interaction.user.id,
      targetId: user.id,
      details: title,
      style: 'emerald'
    });
    await interaction.reply({
      embeds: [success(db, interaction.guild.id, `Event hosted credit logged for ${user}.`)],
      ephemeral: true
    });
    return true;
  }

  if (sub === 'awards') {
    requireStaffManager(db, interaction.member);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Staff Awards',
          description: STAFF_AWARDS.map((award) => `${award.label} - \`${award.key}\``).join('\n'),
          style: 'amber'
        })
      ],
      ephemeral: true
    });
    return true;
  }

  if (group === 'award') {
    return handleAwardSlash(interaction, db);
  }

  return false;
}

async function handleAwardSlash(interaction, db) {
  requireStaffManager(db, interaction.member);
  const sub = interaction.options.getSubcommand();

  if (sub === 'give') {
    const user = interaction.options.getUser('user', true);
    const award = awardByKey(interaction.options.getString('award'));
    const reason = interaction.options.getString('reason') || 'Awarded by Command Staff';
    ensureProfile(db, interaction.guild.id, user.id);
    db.db
      .prepare(
        `INSERT INTO staff_awards
         (guild_id, user_id, award_key, award_label, awarded_by, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(interaction.guild.id, user.id, award.key, award.label, interaction.user.id, reason, now());
    await logStaffAction(db, interaction.guild, {
      title: 'Staff Award Issued',
      action: 'staff_award',
      actorId: interaction.user.id,
      targetId: user.id,
      details: `${award.label}\nReason: ${reason}`,
      style: 'amber'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `${award.label} awarded to ${user}.`)], ephemeral: true });
    return true;
  }

  const rows = db.db
    .prepare(
      `SELECT user_id, COUNT(*) AS count
       FROM staff_awards
       WHERE guild_id = ?
       GROUP BY user_id
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(interaction.guild.id);
  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: 'Staff Award Leaderboard',
        description: rows.length
          ? rows.map((row, index) => `${index + 1}. ${userMention(row.user_id)} - **${row.count}** awards`).join('\n')
          : 'No staff awards issued yet.',
        style: 'amber'
      })
    ],
    ephemeral: true
  });
  return true;
}

async function handlePromotionSlash(interaction, db, direction) {
  requireStaffManager(db, interaction.member);
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const profile = ensureProfile(db, interaction.guild.id, user.id);
  const current = rankIndex(profile.rank_key);
  const nextIndex = direction === 'promote'
    ? Math.min(STAFF_RANKS.length - 1, current + 1)
    : Math.max(0, current - 1);
  if (nextIndex === current) {
    throw new Error(direction === 'promote' ? 'That officer is already at the top rank.' : 'That officer is already at the lowest rank.');
  }
  const nextRank = STAFF_RANKS[nextIndex];
  db.db
    .prepare('UPDATE staff_profiles SET rank_key = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
    .run(nextRank.key, now(), interaction.guild.id, user.id);
  db.db
    .prepare(
      `INSERT INTO staff_rank_history
       (guild_id, user_id, actor_id, action, old_rank_key, new_rank_key, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(interaction.guild.id, user.id, interaction.user.id, direction, profile.rank_key, nextRank.key, reason, now());

  await logStaffAction(db, interaction.guild, {
    title: direction === 'promote' ? 'Promotion Logged' : 'Demotion Logged',
    action: direction,
    actorId: interaction.user.id,
    targetId: user.id,
    details: `${rankByKey(profile.rank_key).label} -> ${nextRank.label}\nReason: ${reason}`,
    style: direction === 'promote' ? 'emerald' : 'ruby'
  });
  await interaction.reply({
    embeds: [success(db, interaction.guild.id, `${user} moved through the Chain of Command: **${rankByKey(profile.rank_key).label}** -> **${nextRank.label}**.`)],
    ephemeral: true
  });
  return true;
}

async function handleRankSlash(interaction, db) {
  requireStaffManager(db, interaction.member);
  const user = interaction.options.getUser('user', true);
  const rows = db.db
    .prepare(
      `SELECT * FROM staff_rank_history
       WHERE guild_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 10`
    )
    .all(interaction.guild.id, user.id);
  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Rank History - ${user.tag || user.username}`,
        description: (rows.length
          ? rows.map((row) => `<t:${Math.floor(row.created_at / 1000)}:d> ${row.action.toUpperCase()} by ${userMention(row.actor_id)}: ${rankByKey(row.old_rank_key).label} -> ${rankByKey(row.new_rank_key).label}\n${row.reason}`).join('\n\n')
          : 'No Chain of Command history recorded.').slice(0, 3900),
        style: 'royal'
      })
    ],
    ephemeral: true
  });
  return true;
}

function recordModerationHistory(db, guild, targetId, staffId, action, options = {}) {
  db.db
    .prepare(
      `INSERT INTO staff_mod_history
       (guild_id, user_id, staff_id, action, reason, note, duration_ms, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      guild.id,
      targetId,
      staffId,
      action,
      options.reason || null,
      options.note || null,
      options.durationMs || null,
      encode(options.metadata || {}),
      now()
    );

  if (action === 'WARN') incrementStaffStat(db, guild.id, staffId, 'warnings');
  if (action === 'TIMEOUT' || action === 'MUTE') incrementStaffStat(db, guild.id, staffId, 'timeouts');
  if (['WARN', 'TIMEOUT', 'MUTE', 'KICK', 'BAN', 'SOFTBAN'].includes(action)) {
    incrementStaffStat(db, guild.id, staffId, 'cases');
  }
}

async function handleNoteSlash(interaction, db) {
  requireStaff(db, interaction.member);
  const user = interaction.options.getUser('user', true);
  const note = interaction.options.getString('note');
  const action = interaction.options.getString('action') || (note ? 'add' : 'list');

  if (action === 'add') {
    if (!note) throw new Error('Internal staff note text is required.');
    db.addNote(interaction.guild.id, user.id, interaction.user.id, note);
    recordModerationHistory(db, interaction.guild, user.id, interaction.user.id, 'NOTE', { note });
    await logStaffAction(db, interaction.guild, {
      title: 'Internal Staff Note Added',
      action: 'staff_note',
      actorId: interaction.user.id,
      targetId: user.id,
      details: note,
      style: 'royal'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Internal note added for ${user}.`)], ephemeral: true });
    return true;
  }

  const notes = db.listNotes(interaction.guild.id, user.id, 10);
  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Internal Notes - ${user.tag || user.username}`,
        description: notes.length
          ? notes.map((entry) => `<t:${Math.floor(entry.created_at / 1000)}:d> ${userMention(entry.moderator_id)}: ${entry.note}`).join('\n')
          : 'No internal staff notes recorded.',
        style: 'royal'
      })
    ],
    ephemeral: true
  });
  return true;
}

async function handleHistorySlash(interaction, db) {
  requireStaff(db, interaction.member);
  const user = interaction.options.getUser('user', true);
  const cases = db.listCases(interaction.guild.id, user.id, 12);
  const notes = db.listNotes(interaction.guild.id, user.id, 6);
  const staffRows = db.db
    .prepare(
      `SELECT * FROM staff_mod_history
       WHERE guild_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 12`
    )
    .all(interaction.guild.id, user.id);

  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Moderation History - ${user.tag || user.username}`,
        fields: [
          {
            name: 'Warnings, Timeouts, Kicks, Bans',
            value: cases.length
              ? cases.map((entry) => `#${entry.case_id} **${entry.type}** by ${entry.moderator_id ? userMention(entry.moderator_id) : 'System'} - ${entry.reason || 'No reason'}`).join('\n').slice(0, 1024)
              : 'No moderation cases recorded.'
          },
          {
            name: 'Internal Staff Notes',
            value: notes.length
              ? notes.map((entry) => `<t:${Math.floor(entry.created_at / 1000)}:d> ${entry.note}`).join('\n').slice(0, 1024)
              : 'No notes recorded.'
          },
          {
            name: 'Staff Activity Ledger',
            value: staffRows.length
              ? staffRows.map((entry) => `<t:${Math.floor(entry.created_at / 1000)}:d> **${entry.action}** by ${userMention(entry.staff_id)} - ${entry.reason || entry.note || 'No details'}`).join('\n').slice(0, 1024)
              : 'No staff ledger entries.'
          }
        ],
        style: 'cyber'
      })
    ],
    ephemeral: true
  });
  return true;
}

async function handleIaSlash(interaction, db) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'report') {
    const staffUser = interaction.options.getUser('staff', true);
    const summary = interaction.options.getString('summary', true);
    const evidence = interaction.options.getString('evidence') || null;
    const iaId = nextStaffId(db, interaction.guild.id, 'next_internal_affairs_id');
    const time = now();
    db.db
      .prepare(
        `INSERT INTO staff_ia_cases
         (guild_id, ia_id, reporter_id, staff_id, summary, evidence, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, ?)`
      )
      .run(interaction.guild.id, iaId, interaction.user.id, staffUser.id, summary, evidence, time, time);
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Internal Affairs case #${iaId} opened.`)], ephemeral: true });
    await logStaffAction(db, interaction.guild, {
      title: 'Internal Affairs Case Opened',
      action: 'ia_report',
      actorId: interaction.user.id,
      targetId: staffUser.id,
      referenceType: 'IA',
      referenceId: iaId,
      details: summary,
      fields: evidence ? [{ name: 'Evidence', value: clampText(evidence, 1024) }] : [],
      style: 'ruby'
    });
    await sendConfiguredEmbed(db, interaction.guild, 'internal_affairs_channel', buildEmbed(db, interaction.guild.id, {
      title: `Internal Affairs Case #${iaId}`,
      description: summary,
      fields: [
        { name: 'Reporter', value: userMention(interaction.user.id), inline: true },
        { name: 'Reported Staff', value: userMention(staffUser.id), inline: true },
        { name: 'Status', value: 'Open', inline: true },
        evidence ? { name: 'Evidence', value: clampText(evidence, 1024) } : null
      ].filter(Boolean),
      style: 'ruby'
    }));
    return true;
  }

  requireStaffManager(db, interaction.member);
  const iaId = interaction.options.getInteger('case_id', true);
  const row = db.db
    .prepare('SELECT * FROM staff_ia_cases WHERE guild_id = ? AND ia_id = ?')
    .get(interaction.guild.id, iaId);
  if (!row) throw new Error('Internal Affairs case not found.');

  if (sub === 'investigate') {
    const investigator = interaction.options.getUser('investigator') || interaction.user;
    const notes = interaction.options.getString('notes') || row.notes || null;
    db.db
      .prepare(
        `UPDATE staff_ia_cases
         SET investigator_id = ?, status = 'Investigating', notes = ?, updated_at = ?
         WHERE guild_id = ? AND ia_id = ?`
      )
      .run(investigator.id, notes, now(), interaction.guild.id, iaId);
    await logStaffAction(db, interaction.guild, {
      title: 'Internal Affairs Investigation Assigned',
      action: 'ia_investigate',
      actorId: interaction.user.id,
      targetId: row.staff_id,
      referenceType: 'IA',
      referenceId: iaId,
      details: `Investigator: ${userMention(investigator.id)}${notes ? `\nNotes: ${notes}` : ''}`,
      style: 'amber'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `IA case #${iaId} is now Investigating.`)], ephemeral: true });
    return true;
  }

  const outcome = interaction.options.getString('outcome', true);
  const notes = interaction.options.getString('notes') || row.notes || null;
  db.db
    .prepare(
      `UPDATE staff_ia_cases
       SET status = 'Closed', outcome = ?, notes = ?, closed_at = ?, updated_at = ?
       WHERE guild_id = ? AND ia_id = ?`
    )
    .run(outcome, notes, now(), now(), interaction.guild.id, iaId);
  incrementStaffStat(db, interaction.guild.id, row.investigator_id || interaction.user.id, 'reports');
  incrementStaffStat(db, interaction.guild.id, row.investigator_id || interaction.user.id, 'cases');
  await logStaffAction(db, interaction.guild, {
    title: 'Internal Affairs Case Closed',
    action: 'ia_close',
    actorId: interaction.user.id,
    targetId: row.staff_id,
    referenceType: 'IA',
    referenceId: iaId,
    details: outcome,
    style: 'emerald'
  });
  await interaction.reply({ embeds: [success(db, interaction.guild.id, `IA case #${iaId} closed.`)], ephemeral: true });
  return true;
}

async function handleStaffCaseSlash(interaction, db, fallbackModerationHandler) {
  const sub = interaction.options.getSubcommand();
  if (['show', 'change', 'delete'].includes(sub)) {
    if (fallbackModerationHandler) return fallbackModerationHandler(interaction, db);
    return false;
  }

  requireStaff(db, interaction.member);

  if (sub === 'create') {
    const title = interaction.options.getString('title', true);
    const target = interaction.options.getUser('target');
    const priority = interaction.options.getString('priority') || 'Medium';
    const notes = interaction.options.getString('notes') || null;
    if (!STAFF_CASE_PRIORITIES.has(priority)) throw new Error('Invalid case priority.');
    const caseId = nextStaffId(db, interaction.guild.id, 'next_staff_case_id');
    const time = now();
    db.db
      .prepare(
        `INSERT INTO staff_cases
         (guild_id, staff_case_id, title, target_id, priority, status, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?)`
      )
      .run(interaction.guild.id, caseId, title, target?.id || null, priority, notes, interaction.user.id, time, time);
    await logStaffAction(db, interaction.guild, {
      title: 'Case File Created',
      action: 'staff_case_create',
      actorId: interaction.user.id,
      targetId: target?.id,
      referenceType: 'Case File',
      referenceId: caseId,
      details: `${title}\nPriority: ${priority}${notes ? `\nNotes: ${notes}` : ''}`,
      style: priority === 'Critical' ? 'ruby' : 'cyber'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Case File #${caseId} created.`)], ephemeral: true });
    return true;
  }

  const caseId = interaction.options.getInteger('case_id', true);
  const row = db.db
    .prepare('SELECT * FROM staff_cases WHERE guild_id = ? AND staff_case_id = ?')
    .get(interaction.guild.id, caseId);
  if (!row) throw new Error('Case File not found.');

  if (sub === 'assign') {
    const assignee = interaction.options.getUser('staff', true);
    db.db
      .prepare('UPDATE staff_cases SET assigned_to = ?, status = ?, updated_at = ? WHERE guild_id = ? AND staff_case_id = ?')
      .run(assignee.id, 'Investigating', now(), interaction.guild.id, caseId);
    ensureProfile(db, interaction.guild.id, assignee.id);
    await logStaffAction(db, interaction.guild, {
      title: 'Case File Assigned',
      action: 'staff_case_assign',
      actorId: interaction.user.id,
      targetId: assignee.id,
      referenceType: 'Case File',
      referenceId: caseId,
      details: row.title,
      style: 'amber'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Case File #${caseId} assigned to ${assignee}.`)], ephemeral: true });
    return true;
  }

  if (sub === 'close') {
    const outcome = interaction.options.getString('outcome', true);
    db.db
      .prepare(
        `UPDATE staff_cases
         SET status = 'Closed', outcome = ?, closed_by = ?, closed_at = ?, updated_at = ?
         WHERE guild_id = ? AND staff_case_id = ?`
      )
      .run(outcome, interaction.user.id, now(), now(), interaction.guild.id, caseId);
    incrementStaffStat(db, interaction.guild.id, row.assigned_to || interaction.user.id, 'cases');
    await logStaffAction(db, interaction.guild, {
      title: 'Case File Closed',
      action: 'staff_case_close',
      actorId: interaction.user.id,
      targetId: row.target_id,
      referenceType: 'Case File',
      referenceId: caseId,
      details: outcome,
      style: 'emerald'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Case File #${caseId} closed.`)], ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Case File #${row.staff_case_id}`,
        description: row.title,
        fields: [
          { name: 'Status', value: row.status, inline: true },
          { name: 'Priority', value: row.priority, inline: true },
          { name: 'Subject', value: row.target_id ? userMention(row.target_id) : 'None', inline: true },
          { name: 'Assigned', value: row.assigned_to ? userMention(row.assigned_to) : 'Unassigned', inline: true },
          { name: 'Notes', value: row.notes || 'No case notes.' },
          row.outcome ? { name: 'Outcome', value: row.outcome } : null
        ].filter(Boolean),
        style: row.priority === 'Critical' ? 'ruby' : 'cyber'
      })
    ],
    ephemeral: true
  });
  return true;
}

async function handleIncidentSlash(interaction, db) {
  requireStaff(db, interaction.member);
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const incidentId = nextStaffId(db, interaction.guild.id, 'next_incident_id');
    const title = interaction.options.getString('title', true);
    const summary = interaction.options.getString('summary', true);
    const involved = String(interaction.options.getString('involved_users') || '')
      .split(/[,\s]+/)
      .map(userIdFromValue)
      .filter(Boolean);
    const evidence = interaction.options.getString('evidence');
    const evidenceList = evidence ? [evidence] : [];
    const time = now();
    db.db
      .prepare(
        `INSERT INTO staff_incidents
         (guild_id, incident_id, title, summary, involved_users, evidence, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(interaction.guild.id, incidentId, title, summary, encode(involved), encode(evidenceList), interaction.user.id, time, time);
    await logStaffAction(db, interaction.guild, {
      title: 'Incident Report Filed',
      action: 'incident_create',
      actorId: interaction.user.id,
      referenceType: 'Incident',
      referenceId: incidentId,
      details: `${title}\n${summary}`,
      style: 'ruby'
    });
    await sendConfiguredEmbed(db, interaction.guild, 'incident_reports_channel', buildEmbed(db, interaction.guild.id, {
      title: `Incident Report #${incidentId}`,
      description: summary,
      fields: [
        { name: 'Filed By', value: userMention(interaction.user.id), inline: true },
        { name: 'Involved Users', value: involved.length ? involved.map(userMention).join(', ') : 'None listed', inline: true },
        evidence ? { name: 'Evidence', value: clampText(evidence, 1024) } : null
      ].filter(Boolean),
      style: 'ruby'
    }));
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Incident Report #${incidentId} filed.`)], ephemeral: true });
    return true;
  }

  const incidentId = interaction.options.getInteger('incident_id', true);
  const row = db.db
    .prepare('SELECT * FROM staff_incidents WHERE guild_id = ? AND incident_id = ?')
    .get(interaction.guild.id, incidentId);
  if (!row) throw new Error('Incident Report not found.');

  if (sub === 'evidence') {
    const evidence = interaction.options.getString('evidence', true);
    const list = decode(row.evidence, []);
    list.push(evidence);
    db.db
      .prepare('UPDATE staff_incidents SET evidence = ?, updated_at = ? WHERE guild_id = ? AND incident_id = ?')
      .run(encode(list), now(), interaction.guild.id, incidentId);
    await logStaffAction(db, interaction.guild, {
      title: 'Incident Evidence Added',
      action: 'incident_evidence',
      actorId: interaction.user.id,
      referenceType: 'Incident',
      referenceId: incidentId,
      details: evidence,
      style: 'amber'
    });
    await interaction.reply({ embeds: [success(db, interaction.guild.id, `Evidence added to Incident Report #${incidentId}.`)], ephemeral: true });
    return true;
  }

  const outcome = interaction.options.getString('outcome', true);
  db.db
    .prepare(
      `UPDATE staff_incidents
       SET status = 'Closed', outcome = ?, closed_by = ?, closed_at = ?, updated_at = ?
       WHERE guild_id = ? AND incident_id = ?`
    )
    .run(outcome, interaction.user.id, now(), now(), interaction.guild.id, incidentId);
  incrementStaffStat(db, interaction.guild.id, interaction.user.id, 'reports');
  incrementStaffStat(db, interaction.guild.id, interaction.user.id, 'cases');
  await logStaffAction(db, interaction.guild, {
    title: 'Incident Report Closed',
    action: 'incident_close',
    actorId: interaction.user.id,
    referenceType: 'Incident',
    referenceId: incidentId,
    details: outcome,
    style: 'emerald'
  });
  await interaction.reply({ embeds: [success(db, interaction.guild.id, `Incident Report #${incidentId} closed.`)], ephemeral: true });
  return true;
}

async function handleStaffButton(db, interaction) {
  if (!interaction.customId.startsWith('staff-app:')) return false;
  requireStaffManager(db, interaction.member);
  const [, action, applicationId] = interaction.customId.split(':');
  if (!['accept', 'deny'].includes(action)) return false;
  await interaction.showModal(reviewNotesModal(action, applicationId));
  return true;
}

async function handleStaffSelect(db, interaction) {
  if (interaction.customId !== 'staff-app:review') return false;
  requireStaffManager(db, interaction.member);
  const app = getApplication(db, interaction.guild.id, interaction.values[0]);
  if (!app) throw new Error('Application file not found.');
  await interaction.update({
    embeds: [applicationEmbed(db, interaction.guild.id, app)],
    components: app.status === 'pending' ? [applicationButtons(app.application_id)] : []
  });
  return true;
}

async function handleStaffModal(db, interaction) {
  if (interaction.customId === 'staff-apply') {
    const questions = applicationQuestions(db, interaction.guild.id);
    const answers = questions.map((question, index) => ({
      question,
      answer: interaction.fields.getTextInputValue(`q${index}`)
    }));
    const app = createApplication(db, interaction.guild.id, interaction.user.id, answers);
    await interaction.reply({
      embeds: [success(db, interaction.guild.id, `Your Operations Command application was filed as #${app.application_id}.`)],
      ephemeral: true
    });
    await sendApplicationReviewLog(db, interaction.guild, app);
    await logStaffAction(db, interaction.guild, {
      title: 'Staff Application Filed',
      action: 'application_create',
      actorId: interaction.user.id,
      targetId: interaction.user.id,
      referenceType: 'Application',
      referenceId: app.application_id,
      details: 'A new staff application is waiting for Command Staff review.',
      style: 'royal'
    });
    return true;
  }

  if (interaction.customId.startsWith('staff-app-note:')) {
    const [, action, applicationId] = interaction.customId.split(':');
    const app = await reviewApplication(
      db,
      interaction,
      applicationId,
      action === 'accept' ? 'accepted' : 'denied',
      interaction.fields.getTextInputValue('notes') || ''
    );
    await interaction.reply({
      embeds: [success(db, interaction.guild.id, `Application #${app.application_id} ${app.status}.`)],
      ephemeral: true
    });
    return true;
  }

  return false;
}

function staffAwardChoices() {
  return STAFF_AWARDS.map((award) => ({ name: award.label, value: award.key }));
}

function staffRankChoices() {
  return STAFF_RANKS.map((rank) => ({ name: rank.label, value: rank.key }));
}

module.exports = {
  STAFF_AWARDS,
  STAFF_RANKS,
  handleDutySlash,
  handleHistorySlash,
  handleIaSlash,
  handleIncidentSlash,
  handleLoaSlash,
  handleNoteSlash,
  handlePromotionSlash,
  handleRankSlash,
  handleStaffButton,
  handleStaffCaseSlash,
  handleStaffModal,
  handleStaffSelect,
  handleStaffSlash,
  incrementStaffStat,
  recordModerationHistory,
  staffAwardChoices,
  staffRankChoices,
  canUseStaffSystem
};
