const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { buildEmbed } = require('../embeds');
const { isBotOwner } = require('../permissions');
const profileCards = require('./profileCard');

const XP_COOLDOWN_MS = 45 * 1000;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const DAILY_RESET_MS = 48 * 60 * 60 * 1000;

const MESSAGE_ACHIEVEMENTS = [
  { key: 'first_message', threshold: 1, name: 'First Steps', description: 'Sent the first tracked message.' },
  { key: 'message_10', threshold: 10, name: 'Joining In', description: 'Sent 10 tracked messages.' },
  { key: 'talkative', threshold: 25, name: 'Talkative', description: 'Sent 25 tracked messages.' },
  { key: 'message_50', threshold: 50, name: 'Chatter', description: 'Sent 50 tracked messages.' },
  { key: 'regular', threshold: 100, name: 'Regular', description: 'Sent 100 tracked messages.' },
  { key: 'message_250', threshold: 250, name: 'Crowd Favorite', description: 'Sent 250 tracked messages.' },
  { key: 'message_500', threshold: 500, name: 'Half Thousand', description: 'Sent 500 tracked messages.' },
  { key: 'message_1000', threshold: 1000, name: 'Thousand Words', description: 'Sent 1,000 tracked messages.' },
  { key: 'message_2500', threshold: 2500, name: 'Forum Fixture', description: 'Sent 2,500 tracked messages.' },
  { key: 'message_5000', threshold: 5000, name: 'Channel Veteran', description: 'Sent 5,000 tracked messages.' },
  { key: 'message_10000', threshold: 10000, name: 'Ten Thousand Club', description: 'Sent 10,000 tracked messages.' },
  { key: 'message_25000', threshold: 25000, name: 'Server Voice', description: 'Sent 25,000 tracked messages.' },
  { key: 'message_50000', threshold: 50000, name: 'Marathon Messenger', description: 'Sent 50,000 tracked messages.' },
  { key: 'message_100000', threshold: 100000, name: 'Legendary Speaker', description: 'Sent 100,000 tracked messages.' }
];

const LEVEL_ACHIEVEMENTS = [
  { key: 'level_2', threshold: 2, name: 'Level 2', description: 'Reached level 2.' },
  { key: 'level_3', threshold: 3, name: 'Level 3', description: 'Reached level 3.' },
  { key: 'level_5', threshold: 5, name: 'Level 5', description: 'Reached level 5.' },
  { key: 'level_10', threshold: 10, name: 'Level 10', description: 'Reached level 10.' },
  { key: 'level_15', threshold: 15, name: 'Level 15', description: 'Reached level 15.' },
  { key: 'level_20', threshold: 20, name: 'Level 20', description: 'Reached level 20.' },
  { key: 'level_25', threshold: 25, name: 'Level 25', description: 'Reached level 25.' },
  { key: 'level_30', threshold: 30, name: 'Level 30', description: 'Reached level 30.' },
  { key: 'level_40', threshold: 40, name: 'Level 40', description: 'Reached level 40.' },
  { key: 'level_50', threshold: 50, name: 'Level 50', description: 'Reached level 50.' },
  { key: 'level_60', threshold: 60, name: 'Level 60', description: 'Reached level 60.' },
  { key: 'level_75', threshold: 75, name: 'Level 75', description: 'Reached level 75.' },
  { key: 'level_100', threshold: 100, name: 'Level 100', description: 'Reached level 100.' },
  { key: 'level_125', threshold: 125, name: 'Level 125', description: 'Reached level 125.' },
  { key: 'level_150', threshold: 150, name: 'Level 150', description: 'Reached level 150.' },
  { key: 'level_200', threshold: 200, name: 'Level 200', description: 'Reached level 200.' }
];

const XP_ACHIEVEMENTS = [
  { key: 'xp_100', threshold: 100, name: 'XP Starter', description: 'Reached 100 XP.' },
  { key: 'xp_500', threshold: 500, name: 'XP Collector', description: 'Reached 500 XP.' },
  { key: 'xp_1000', threshold: 1000, name: 'XP Hoarder', description: 'Reached 1,000 XP.' },
  { key: 'xp_2500', threshold: 2500, name: 'XP Grinder', description: 'Reached 2,500 XP.' },
  { key: 'xp_5000', threshold: 5000, name: 'XP Specialist', description: 'Reached 5,000 XP.' },
  { key: 'xp_10000', threshold: 10000, name: 'XP Champion', description: 'Reached 10,000 XP.' },
  { key: 'xp_25000', threshold: 25000, name: 'XP Legend', description: 'Reached 25,000 XP.' },
  { key: 'xp_50000', threshold: 50000, name: 'XP Master', description: 'Reached 50,000 XP.' },
  { key: 'xp_100000', threshold: 100000, name: 'XP Titan', description: 'Reached 100,000 XP.' },
  { key: 'xp_250000', threshold: 250000, name: 'XP Overlord', description: 'Reached 250,000 XP.' },
  { key: 'xp_500000', threshold: 500000, name: 'XP Immortal', description: 'Reached 500,000 XP.' },
  { key: 'xp_1000000', threshold: 1000000, name: 'XP Mythic', description: 'Reached 1,000,000 XP.' }
];

const COIN_ACHIEVEMENTS = [
  { key: 'coins_100', threshold: 100, name: 'Pocket Change', description: 'Reached 100 coins.' },
  { key: 'coins_500', threshold: 500, name: 'Coin Pouch', description: 'Reached 500 coins.' },
  { key: 'rich_1000', threshold: 1000, name: 'Stacked', description: 'Reached 1,000 coins.' },
  { key: 'coins_2500', threshold: 2500, name: 'Savings Plan', description: 'Reached 2,500 coins.' },
  { key: 'coins_5000', threshold: 5000, name: 'Big Saver', description: 'Reached 5,000 coins.' },
  { key: 'coins_10000', threshold: 10000, name: 'Money Bags', description: 'Reached 10,000 coins.' },
  { key: 'coins_25000', threshold: 25000, name: 'Treasure Chest', description: 'Reached 25,000 coins.' },
  { key: 'coins_50000', threshold: 50000, name: 'High Roller', description: 'Reached 50,000 coins.' },
  { key: 'coins_100000', threshold: 100000, name: 'Fortune Builder', description: 'Reached 100,000 coins.' },
  { key: 'coins_250000', threshold: 250000, name: 'Vault Keeper', description: 'Reached 250,000 coins.' },
  { key: 'coins_500000', threshold: 500000, name: 'Server Tycoon', description: 'Reached 500,000 coins.' },
  { key: 'coins_1000000', threshold: 1000000, name: 'Millionaire', description: 'Reached 1,000,000 coins.' }
];

const STREAK_ACHIEVEMENTS = [
  { key: 'streak_2', threshold: 2, name: 'Back Tomorrow', description: 'Kept a 2 day daily streak.' },
  { key: 'streak_3', threshold: 3, name: 'Three Day Habit', description: 'Kept a 3 day daily streak.' },
  { key: 'streak_7', threshold: 7, name: 'Seven Day Streak', description: 'Kept a 7 day daily streak.' },
  { key: 'streak_14', threshold: 14, name: 'Two Week Streak', description: 'Kept a 14 day daily streak.' },
  { key: 'streak_30', threshold: 30, name: 'Monthly Regular', description: 'Kept a 30 day daily streak.' },
  { key: 'streak_60', threshold: 60, name: 'Two Month Run', description: 'Kept a 60 day daily streak.' },
  { key: 'streak_100', threshold: 100, name: 'Century Streak', description: 'Kept a 100 day daily streak.' },
  { key: 'streak_180', threshold: 180, name: 'Half Year Grind', description: 'Kept a 180 day daily streak.' },
  { key: 'streak_365', threshold: 365, name: 'Full Year Loyal', description: 'Kept a 365 day daily streak.' },
  { key: 'streak_500', threshold: 500, name: 'Streak Royalty', description: 'Kept a 500 day daily streak.' },
  { key: 'streak_1000', threshold: 1000, name: 'Daily Immortal', description: 'Kept a 1,000 day daily streak.' }
];

const SPECIAL_ACHIEVEMENTS = [
  { key: 'first_daily', name: 'Payday', description: 'Claimed a daily reward.' }
];

const PROGRESS_ACHIEVEMENT_GROUPS = [
  { field: 'messages', entries: MESSAGE_ACHIEVEMENTS },
  { field: 'level', entries: LEVEL_ACHIEVEMENTS },
  { field: 'xp', entries: XP_ACHIEVEMENTS },
  { field: 'balance', entries: COIN_ACHIEVEMENTS },
  { field: 'daily_streak', entries: STREAK_ACHIEVEMENTS }
];

const ACHIEVEMENTS = Object.fromEntries(
  [
    ...MESSAGE_ACHIEVEMENTS,
    ...LEVEL_ACHIEVEMENTS,
    ...XP_ACHIEVEMENTS,
    ...COIN_ACHIEVEMENTS,
    ...STREAK_ACHIEVEMENTS,
    ...SPECIAL_ACHIEVEMENTS
  ].map((achievement) => [achievement.key, {
    name: achievement.name,
    description: achievement.description
  }])
);

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

function levelProgress(progress) {
  const level = Math.max(1, Number(progress.level || 1));
  const xp = Math.max(0, Number(progress.xp || 0));
  const levelBaseXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const neededXp = Math.max(1, nextLevelXp - levelBaseXp);
  const currentXp = Math.max(0, Math.min(neededXp, xp - levelBaseXp));
  return {
    level,
    xp,
    levelBaseXp,
    nextLevelXp,
    currentXp,
    neededXp
  };
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

function formatAchievementNames(keys, limit = 900) {
  const names = keys.map((key) => achievementInfo(key).name);
  let text = '';
  for (let index = 0; index < names.length; index += 1) {
    const separator = text ? ', ' : '';
    const hidden = names.length - index - 1;
    const suffix = hidden > 0 ? `, and ${hidden} more` : '';
    const next = `${text}${separator}${names[index]}`;
    if (`${next}${suffix}`.length > limit) {
      return text ? `${text}, and ${hidden + 1} more` : `${hidden + 1} achievements`;
    }
    text = next;
  }
  return text;
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
  return PROGRESS_ACHIEVEMENT_GROUPS
    .flatMap(({ field, entries }) => entries
      .filter((achievement) => Number(progress[field] || 0) >= achievement.threshold)
      .map((achievement) => achievement.key))
    .filter((key) => db.addAchievement(guildId, userId, key));
}

async function sendAchievementNotice(db, message, keys) {
  const names = formatAchievementNames(keys, 1000);
  const configuredChannel = db.getConfig(message.guild.id, 'achievement_channel') ||
    db.getConfig(message.guild.id, 'level_announce_channel');
  const channel = configuredChannel
    ? await message.guild.channels.fetch(configuredChannel).catch(() => null)
    : message.channel;
  if (!channel?.isTextBased()) return;

  const first = achievementInfo(keys[0]);
  const imageName = `achievement-${message.author.id}.png`;
  const image = achievementCardBuffer(message.author, {
    name: keys.length > 1 ? `${first.name} +${keys.length - 1}` : first.name,
    description: first.description,
    count: keys.length
  });

  await channel.send({
    content: `${message.author}`,
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: `${message.guild.name} Achievements`,
        description: [
          `Lets go! ${message.author}`,
          'You just unlocked the achievement:',
          `**${names}**`
        ].join('\n'),
        image: `attachment://${imageName}`,
        style: 'violet'
      })
    ],
    files: [
      new AttachmentBuilder(image, { name: imageName })
    ],
    components: [progressActionRow(message.author.id)],
    allowedMentions: { users: [message.author.id] }
  });
}

async function sendLevelAnnouncement(db, message, progress, xpGain) {
  const configuredChannel = db.getConfig(message.guild.id, 'level_announce_channel');
  const channel = configuredChannel
    ? await message.guild.channels.fetch(configuredChannel).catch(() => null)
    : message.channel;
  if (!channel?.isTextBased()) return;

  const imageName = `level-${message.author.id}.png`;
  const rank = typeof db.memberProgressRank === 'function'
    ? db.memberProgressRank(message.guild.id, message.author.id, 'xp')
    : null;
  const image = levelCardBuffer(message.author, progress, rank);

  await channel.send({
    content: `${message.author} Has Reached Level ${progress.level}. GG!`,
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Level Up',
        description: `${message.author} reached **level ${progress.level}**.${xpGain ? ` +${xpGain} XP` : ''}`,
        image: `attachment://${imageName}`,
        fields: [
          { name: 'Total XP', value: String(progress.xp), inline: true },
          { name: 'Next Level', value: String(xpForLevel(progress.level + 1)), inline: true }
        ],
        style: 'royal'
      })
    ],
    files: [
      new AttachmentBuilder(image, { name: imageName })
    ],
    components: [progressActionRow(message.author.id)],
    allowedMentions: { users: [message.author.id] }
  });
}

function progressActionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`progress:profile:${userId}`)
      .setLabel('Profile')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`progress:achievements:${userId}`)
      .setLabel('Achievements')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('progress:leaderboard')
      .setLabel('Leaderboard')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function handleProgressButton(db, interaction) {
  const [, action, userId] = String(interaction.customId || '').split(':');
  const targetUserId = userId || interaction.user.id;
  const user = await interaction.client.users.fetch(targetUserId).catch(() => interaction.user);

  if (action === 'leaderboard') {
    const rows = db.listProgressLeaderboard(interaction.guild.id, 'xp', 10);
    await interaction.reply({ embeds: [leaderboardEmbed(db, interaction.guild, rows, 'xp')], ephemeral: true });
    return;
  }

  const progress = db.ensureMemberProgress(interaction.guild.id, targetUserId);
  const achievements = db.listAchievements(interaction.guild.id, targetUserId);
  if (action === 'achievements') {
    const earned = achievements
      .map((row) => {
        const info = achievementInfo(row.key);
        return `**${info.name}** - ${info.description}`;
      })
      .join('\n') || 'No achievements unlocked yet.';
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: `${user.username || user.tag} Achievements`,
          description: earned,
          style: 'violet'
        })
      ],
      ephemeral: true
    });
    return;
  }

  const rank = typeof db.memberProgressRank === 'function'
    ? db.memberProgressRank(interaction.guild.id, targetUserId, 'xp')
    : null;
  const imageName = `profile-${targetUserId}.png`;
  const embed = profileEmbed(db, interaction.guild, user, progress, achievements);
  embed.setImage(`attachment://${imageName}`);
  await interaction.reply({
    embeds: [embed],
    files: [new AttachmentBuilder(profileCardBuffer(user, progress, achievements, rank), { name: imageName })],
    ephemeral: true
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

function displayName(user) {
  return user?.globalName || user?.displayName || user?.username || user?.tag || user?.id || 'User';
}

function levelCardBuffer(user, progress, rank = null) {
  const metrics = levelProgress(progress);
  return profileCards.createLevelCard({
    username: displayName(user),
    level: metrics.level,
    currentXp: metrics.currentXp,
    neededXp: metrics.neededXp,
    rank
  });
}

function achievementCardBuffer(user, achievement, count = 1) {
  return profileCards.createAchievementCard({
    username: displayName(user),
    name: achievement?.name || 'Achievement',
    description: achievement?.description || 'Unlocked a new milestone',
    count: achievement?.count || count
  });
}

function profileCardBuffer(user, progress, achievements = [], rank = null) {
  const metrics = levelProgress(progress);
  return profileCards.createProfileCard({
    username: displayName(user),
    level: metrics.level,
    currentXp: metrics.currentXp,
    neededXp: metrics.neededXp,
    rank,
    messages: progress.messages || 0,
    coins: progress.balance || 0,
    dailyStreak: progress.daily_streak || 0,
    achievements: achievements.length || 0
  });
}

function profileEmbed(db, guild, user, progress, achievements = []) {
  const nextLevelXp = xpForLevel(Number(progress.level || 1) + 1);
  const earnedKeys = achievements.map((row) => row.key);
  const earned = earnedKeys.length
    ? `${formatAchievementNames(earnedKeys, 900)}\n${earnedKeys.length}/${Object.keys(ACHIEVEMENTS).length} earned`
    : 'None yet';
  return buildEmbed(db, guild.id, {
    title: `${user.username || user.tag} Profile`,
    thumbnail: user.displayAvatarURL?.({ size: 128 }) || null,
    fields: [
      { name: 'Level', value: String(progress.level || 1), inline: true },
      { name: 'XP', value: `${progress.xp || 0} / ${nextLevelXp}`, inline: true },
      { name: 'Coins', value: String(progress.balance || 0), inline: true },
      { name: 'Messages', value: String(progress.messages || 0), inline: true },
      { name: 'Daily Streak', value: String(progress.daily_streak || 0), inline: true },
      { name: 'Achievements', value: earned }
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

function setMemberLevel(db, guildId, userId, level) {
  const nextLevel = Math.max(1, Math.min(500, Number(level || 1)));
  return db.setMemberProgress(guildId, userId, {
    xp: xpForLevel(nextLevel),
    level: nextLevel
  });
}

function addMemberLevels(db, guildId, userId, amount) {
  const current = db.ensureMemberProgress(guildId, userId);
  return setMemberLevel(db, guildId, userId, Number(current.level || 1) + Math.max(1, Number(amount || 1)));
}

function removeMemberLevels(db, guildId, userId, amount) {
  const current = db.ensureMemberProgress(guildId, userId);
  return setMemberLevel(db, guildId, userId, Number(current.level || 1) - Math.max(1, Number(amount || 1)));
}

function resetMemberLevel(db, guildId, userId) {
  return db.setMemberProgress(guildId, userId, {
    xp: 0,
    level: 1,
    lastXpAt: null
  });
}

function addCoins(db, guildId, userId, amount) {
  const current = db.ensureMemberProgress(guildId, userId);
  return db.setMemberProgress(guildId, userId, {
    balance: Number(current.balance || 0) + Math.max(1, Number(amount || 1))
  });
}

function removeCoins(db, guildId, userId, amount) {
  const current = db.ensureMemberProgress(guildId, userId);
  return db.setMemberProgress(guildId, userId, {
    balance: Math.max(0, Number(current.balance || 0) - Math.max(1, Number(amount || 1)))
  });
}

function resetCoins(db, guildId, userId) {
  return db.setMemberProgress(guildId, userId, {
    balance: 0
  });
}

module.exports = {
  ACHIEVEMENTS,
  achievementCardBuffer,
  addRoleReward,
  addCoins,
  addMemberLevels,
  applyLevelRoles,
  awardMessageActivity,
  claimDaily,
  handleProgressButton,
  leaderboardEmbed,
  levelCardBuffer,
  levelFromXp,
  levelProgress,
  listRoleRewards,
  normalizeRoleRewards,
  profileCardBuffer,
  profileEmbed,
  removeCoins,
  removeMemberLevels,
  removeRoleReward,
  resetCoins,
  resetMemberLevel,
  setMemberLevel,
  xpForLevel
};
