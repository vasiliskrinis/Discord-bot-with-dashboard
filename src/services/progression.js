const { buildEmbed } = require('../embeds');
const { isBotOwner } = require('../permissions');

const XP_COOLDOWN_MS = 45 * 1000;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const DAILY_RESET_MS = 48 * 60 * 60 * 1000;

const ACHIEVEMENTS = {
  first_message: {
    name: 'First Steps',
    description: 'Sent the first tracked message.'
  },
  talkative: {
    name: 'Talkative',
    description: 'Sent 25 tracked messages.'
  },
  regular: {
    name: 'Regular',
    description: 'Sent 100 tracked messages.'
  },
  level_5: {
    name: 'Level 5',
    description: 'Reached level 5.'
  },
  level_10: {
    name: 'Level 10',
    description: 'Reached level 10.'
  },
  first_daily: {
    name: 'Payday',
    description: 'Claimed a daily reward.'
  },
  streak_7: {
    name: 'Seven Day Streak',
    description: 'Kept a 7 day daily streak.'
  },
  rich_1000: {
    name: 'Stacked',
    description: 'Reached 1,000 coins.'
  }
};

function configBool(db, guildId, key, fallback = true) {
  const value = db.getConfig(guildId, key, fallback);
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled', 'enable'].includes(lowered)) return true;
  if (['0', 'false', 'no', 'off', 'disabled', 'disable'].includes(lowered)) return false;
  return fallback;
}

function configInt(db, guildId, key, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(db.getConfig(guildId, key, fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function xpForLevel(level) {
  const target = Math.max(1, Number(level || 1));
  return Math.pow(target - 1, 2) * 120;
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp || 0)) / 120)) + 1;
}

function randomInt(min, max) {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function normalizeRoleRewards(value) {
  if (!value) return [];
  const rows = Array.isArray(value)
    ? value
    : typeof value === 'object'
      ? Object.entries(value).map(([level, roleId]) => ({ level, roleId }))
      : [];

  return rows
    .map((row) => ({
      level: Number.parseInt(row.level, 10),
      roleId: String(row.roleId || row.role || row.id || '').replace(/[<@&>]/g, '').trim()
    }))
    .filter((row) => Number.isFinite(row.level) && row.level > 0 && row.roleId)
    .sort((a, b) => a.level - b.level);
}

function achievementInfo(key) {
  return ACHIEVEMENTS[key] || { name: key, description: 'Custom achievement.' };
}

async function awardMessageActivity(db, message) {
  if (!message.guild || !message.member || message.author.bot) return null;
  const guildId = message.guild.id;
  const restrictedRoleId = db.getConfig(guildId, 'restricted_role');
  if (restrictedRoleId && message.member.roles.cache.has(restrictedRoleId)) return null;

  const economyEnabled = configBool(db, guildId, 'economy_enabled', true);
  const levelingEnabled = configBool(db, guildId, 'leveling_enabled', true);
  const achievementsEnabled = configBool(db, guildId, 'achievements_enabled', true);
  if (!economyEnabled && !levelingEnabled && !achievementsEnabled) return null;

  const current = db.ensureMemberProgress(guildId, message.author.id);
  const canGainXp = levelingEnabled && (!current.last_xp_at || Date.now() - current.last_xp_at >= XP_COOLDOWN_MS);
  const minXp = configInt(db, guildId, 'xp_per_message_min', 12, 1, 250);
  const maxXp = configInt(db, guildId, 'xp_per_message_max', 22, minXp, 300);
  const xpGain = canGainXp ? randomInt(minXp, maxXp) : 0;
  const coinGain = economyEnabled && canGainXp ? randomInt(1, 4) : 0;
  const newXp = Number(current.xp || 0) + xpGain;
  const nextLevel = levelFromXp(newXp);
  const leveledUp = nextLevel > Number(current.level || 1);

  const progress = db.addMemberProgress(guildId, message.author.id, {
    xp: xpGain,
    balance: coinGain,
    level: nextLevel,
    messages: 1,
    lastXpAt: canGainXp ? Date.now() : current.last_xp_at
  });

  if (leveledUp) {
    await applyLevelRoles(db, message.member, progress).catch(() => null);
    await sendLevelAnnouncement(db, message, progress, xpGain).catch(() => null);
  }

  if (achievementsEnabled) {
    const earned = awardProgressAchievements(db, guildId, message.author.id, progress);
    if (earned.length) await sendAchievementNotice(db, message, earned).catch(() => null);
  }

  return { progress, xpGain, coinGain, leveledUp };
}

function awardProgressAchievements(db, guildId, userId, progress) {
  const checks = [
    [progress.messages >= 1, 'first_message'],
    [progress.messages >= 25, 'talkative'],
    [progress.messages >= 100, 'regular'],
    [progress.level >= 5, 'level_5'],
    [progress.level >= 10, 'level_10'],
    [progress.balance >= 1000, 'rich_1000'],
    [progress.daily_streak >= 7, 'streak_7']
  ];

  return checks
    .filter(([passed]) => passed)
    .map(([, key]) => key)
    .filter((key) => db.addAchievement(guildId, userId, key));
}

async function sendAchievementNotice(db, message, keys) {
  const names = keys.map((key) => achievementInfo(key).name).join(', ');
  await message.channel.send({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Achievement Unlocked',
        description: `${message.author} earned **${names}**.`,
        style: 'violet'
      })
    ],
    allowedMentions: { users: [message.author.id] }
  });
}

async function sendLevelAnnouncement(db, message, progress, xpGain) {
  const configuredChannel = db.getConfig(message.guild.id, 'level_announce_channel');
  const channel = configuredChannel
    ? await message.guild.channels.fetch(configuredChannel).catch(() => null)
    : message.channel;
  if (!channel?.isTextBased()) return;

  await channel.send({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Level Up',
        description: `${message.author} reached **level ${progress.level}**.${xpGain ? ` +${xpGain} XP` : ''}`,
        fields: [
          { name: 'Total XP', value: String(progress.xp), inline: true },
          { name: 'Next Level', value: String(xpForLevel(progress.level + 1)), inline: true }
        ],
        style: 'royal'
      })
    ],
    allowedMentions: { users: [message.author.id] }
  });
}

async function applyLevelRoles(db, member, progress) {
  if (!member?.guild || isBotOwner(member.id)) return [];
  const rewards = normalizeRoleRewards(db.getConfig(member.guild.id, 'role_level_rewards', []));
  const granted = [];
  for (const reward of rewards.filter((entry) => Number(progress.level || 1) >= entry.level)) {
    if (member.roles.cache.has(reward.roleId)) continue;
    const role = await member.guild.roles.fetch(reward.roleId).catch(() => null);
    if (!role || role.managed || role.id === member.guild.id) continue;
    await member.roles.add(role, `Role reward for level ${reward.level}`).then(() => {
      granted.push(role.id);
    }).catch(() => null);
  }
  return granted;
}

function addRoleReward(db, guildId, level, roleId) {
  const rewards = normalizeRoleRewards(db.getConfig(guildId, 'role_level_rewards', []))
    .filter((entry) => entry.level !== Number(level));
  rewards.push({ level: Number(level), roleId });
  db.setConfig(guildId, 'role_level_rewards', rewards.sort((a, b) => a.level - b.level));
  return rewards;
}

function removeRoleReward(db, guildId, level) {
  const rewards = normalizeRoleRewards(db.getConfig(guildId, 'role_level_rewards', []))
    .filter((entry) => entry.level !== Number(level));
  db.setConfig(guildId, 'role_level_rewards', rewards);
  return rewards;
}

function listRoleRewards(db, guildId) {
  return normalizeRoleRewards(db.getConfig(guildId, 'role_level_rewards', []));
}

function profileEmbed(db, guild, user, progress, achievements = []) {
  const nextLevelXp = xpForLevel(Number(progress.level || 1) + 1);
  const earned = achievements.map((row) => achievementInfo(row.key).name);
  return buildEmbed(db, guild.id, {
    title: `${user.username || user.tag} Profile`,
    thumbnail: user.displayAvatarURL?.({ size: 128 }) || null,
    fields: [
      { name: 'Level', value: String(progress.level || 1), inline: true },
      { name: 'XP', value: `${progress.xp || 0} / ${nextLevelXp}`, inline: true },
      { name: 'Coins', value: String(progress.balance || 0), inline: true },
      { name: 'Messages', value: String(progress.messages || 0), inline: true },
      { name: 'Daily Streak', value: String(progress.daily_streak || 0), inline: true },
      { name: 'Achievements', value: earned.length ? earned.join(', ') : 'None yet' }
    ],
    style: 'ocean'
  });
}

function leaderboardEmbed(db, guild, rows, type = 'xp') {
  return buildEmbed(db, guild.id, {
    title: type === 'balance' ? 'Coin Leaderboard' : 'Level Leaderboard',
    description: rows.length
      ? rows.map((row, index) => {
        const value = type === 'balance'
          ? `${row.balance || 0} coins`
          : `level ${row.level || 1} - ${row.xp || 0} XP`;
        return `**${index + 1}.** <@${row.user_id}> - ${value}`;
      }).join('\n')
      : 'No progress recorded yet.',
    style: type === 'balance' ? 'amber' : 'royal'
  });
}

function claimDaily(db, guildId, userId) {
  if (!configBool(db, guildId, 'economy_enabled', true)) {
    throw new Error('Economy is disabled for this server.');
  }

  const current = db.ensureMemberProgress(guildId, userId);
  const lastDaily = Number(current.last_daily_at || 0);
  const nowMs = Date.now();
  if (lastDaily && nowMs - lastDaily < DAILY_COOLDOWN_MS) {
    return {
      claimed: false,
      nextAt: lastDaily + DAILY_COOLDOWN_MS,
      progress: current
    };
  }

  const nextStreak = lastDaily && nowMs - lastDaily <= DAILY_RESET_MS
    ? Number(current.daily_streak || 0) + 1
    : 1;
  const reward = Math.min(500, 150 + (nextStreak - 1) * 25);
  const progress = db.addMemberProgress(guildId, userId, {
    balance: reward,
    dailyStreak: nextStreak,
    lastDailyAt: nowMs
  });
  const earned = ['first_daily', ...awardProgressAchievements(db, guildId, userId, progress)];
  const newAchievements = [...new Set(earned)].filter((key) => key === 'first_daily'
    ? db.addAchievement(guildId, userId, key)
    : true);

  return {
    claimed: true,
    reward,
    streak: nextStreak,
    progress,
    achievements: newAchievements
  };
}

module.exports = {
  ACHIEVEMENTS,
  addRoleReward,
  applyLevelRoles,
  awardMessageActivity,
  claimDaily,
  leaderboardEmbed,
  listRoleRewards,
  normalizeRoleRewards,
  profileEmbed,
  removeRoleReward,
  xpForLevel
};
