const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { buildEmbed, success } = require('../embeds');

function idFromMention(value) {
  if (!value) return null;
  return String(value).replace(/[<@!#&>]/g, '');
}

function petKey(userId) {
  return `digital_pet:${userId}`;
}

function freshPet(name = 'Byte') {
  return {
    name: String(name || 'Byte').slice(0, 32),
    species: 'Digital Pet',
    hunger: 70,
    happiness: 70,
    energy: 70,
    level: 1,
    xp: 0,
    adoptedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function normalizePet(raw) {
  if (!raw) return null;
  const pet = { ...freshPet(raw.name), ...raw };
  const elapsedHours = Math.max(0, (Date.now() - Number(pet.updatedAt || Date.now())) / 3600000);
  const decay = Math.floor(elapsedHours * 3);
  const rest = Math.floor(elapsedHours * 5);
  return {
    ...pet,
    hunger: clamp(Number(pet.hunger || 0) - decay),
    happiness: clamp(Number(pet.happiness || 0) - decay),
    energy: clamp(Number(pet.energy || 0) + rest),
    updatedAt: Date.now()
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function addPetXp(pet, amount) {
  const next = { ...pet, xp: Number(pet.xp || 0) + amount };
  while (next.xp >= next.level * 100) {
    next.xp -= next.level * 100;
    next.level += 1;
  }
  return next;
}

function petStatusText(pet) {
  return [
    `Name: **${pet.name}**`,
    `Level: **${pet.level}** (${pet.xp}/${pet.level * 100} XP)`,
    `Hunger: **${pet.hunger}/100**`,
    `Happiness: **${pet.happiness}/100**`,
    `Energy: **${pet.energy}/100**`
  ].join('\n');
}

async function sendVerificationPanel(db, target, options = {}) {
  const guild = target.guild;
  const channel = options.channel || target.channel;
  const role = options.role;
  const message = String(options.message || db.getConfig(guild.id, 'verification_message') || '').slice(0, 1000);

  if (!channel?.isTextBased?.()) throw new Error('Verification channel must be a text channel.');
  if (!role || role.managed || role.id === guild.id) throw new Error('Choose a normal verified role.');

  db.setConfig(guild.id, 'verification_channel', channel.id);
  db.setConfig(guild.id, 'verified_role', role.id);
  db.setConfig(guild.id, 'verification_message', message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:claim')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({
    embeds: [
      buildEmbed(db, guild.id, {
        title: 'Verification',
        description: message || 'Press the button below to verify and unlock the server.',
        style: 'emerald'
      })
    ],
    components: [row]
  });
}

async function handleVerifyButton(db, interaction) {
  const roleId = db.getConfig(interaction.guild.id, 'verified_role');
  if (!roleId) {
    await interaction.reply({ content: 'Verification is not configured yet.', ephemeral: true });
    return true;
  }
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await interaction.reply({ content: 'The verified role no longer exists.', ephemeral: true });
    return true;
  }
  await interaction.member.roles.add(role, 'Verification button').catch((err) => {
    throw new Error(err.message || 'Could not add the verified role.');
  });
  await interaction.reply({ embeds: [success(db, interaction.guild.id, `Verified. You now have ${role}.`)], ephemeral: true });
  return true;
}

async function applyChannelRestriction(db, guild, allowedIds = []) {
  const roleId = db.getConfig(guild.id, 'restricted_role');
  if (!roleId) throw new Error('Set restricted_role before applying channel restriction.');

  const exempt = new Set(
    [...allowedIds, ...db.getConfig(guild.id, 'restriction_exempt_channels', [])]
      .map(idFromMention)
      .filter(Boolean)
  );
  db.setConfig(guild.id, 'restriction_exempt_channels', [...exempt]);

  const editableTypes = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildCategory
  ]);

  let updated = 0;
  let skipped = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!editableTypes.has(channel.type) || !channel.permissionOverwrites?.edit) {
      skipped += 1;
      continue;
    }
    const view = exempt.has(channel.id) ? null : false;
    await channel.permissionOverwrites.edit(roleId, { ViewChannel: view }, { reason: 'Channel restriction sync' })
      .then(() => { updated += 1; })
      .catch(() => { skipped += 1; });
  }
  return { updated, skipped, exempt: [...exempt] };
}

async function massSyncCategoryPermissions(guild) {
  let synced = 0;
  let skipped = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.parentId || !channel.lockPermissions) continue;
    await channel.lockPermissions()
      .then(() => { synced += 1; })
      .catch(() => { skipped += 1; });
  }
  return { synced, skipped };
}

async function runBump(db, guild, channel, user) {
  const cooldownMinutes = Math.max(5, Number(db.getConfig(guild.id, 'bump_cooldown_minutes', 120)) || 120);
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const last = Number(db.getState(guild.id, 'bump_last_at', 0));
  const nextAt = last + cooldownMs;
  if (Date.now() < nextAt) {
    return {
      bumped: false,
      nextAt
    };
  }

  db.setState(guild.id, 'bump_last_at', Date.now());
  db.setState(guild.id, 'bump_last_user', user.id);
  const targetId = db.getConfig(guild.id, 'bump_channel') || channel.id;
  const pingRoleId = db.getConfig(guild.id, 'bump_ping_role');
  const target = await guild.channels.fetch(targetId).catch(() => null) || channel;
  await target.send({
    content: pingRoleId ? `<@&${pingRoleId}>` : undefined,
    embeds: [
      buildEmbed(db, guild.id, {
        title: 'Server Bump',
        description: `${guild.name} was bumped by ${user}.\nNext bump: <t:${Math.floor((Date.now() + cooldownMs) / 1000)}:R>.`,
        style: 'royal'
      })
    ],
    allowedMentions: { parse: [], users: [], roles: pingRoleId ? [pingRoleId] : [] }
  });
  return {
    bumped: true,
    nextAt: Date.now() + cooldownMs,
    pingRoleId
  };
}

function petStatus(db, guildId, userId) {
  return normalizePet(db.getState(guildId, petKey(userId), null));
}

function adoptPet(db, guildId, userId, name) {
  const existing = petStatus(db, guildId, userId);
  if (existing) return { pet: existing, adopted: false };
  const pet = freshPet(name);
  db.setState(guildId, petKey(userId), pet);
  return { pet, adopted: true };
}

function feedPet(db, guildId, userId) {
  const pet = petStatus(db, guildId, userId);
  if (!pet) return null;
  const next = addPetXp({ ...pet, hunger: clamp(pet.hunger + 22), energy: clamp(pet.energy + 5), updatedAt: Date.now() }, 20);
  db.setState(guildId, petKey(userId), next);
  return next;
}

function playPet(db, guildId, userId) {
  const pet = petStatus(db, guildId, userId);
  if (!pet) return null;
  const next = addPetXp({
    ...pet,
    happiness: clamp(pet.happiness + 24),
    energy: clamp(pet.energy - 15),
    hunger: clamp(pet.hunger - 8),
    updatedAt: Date.now()
  }, 30);
  db.setState(guildId, petKey(userId), next);
  return next;
}

function resetPet(db, guildId, userId) {
  const existing = petStatus(db, guildId, userId);
  db.setState(guildId, petKey(userId), null);
  return Boolean(existing);
}

module.exports = {
  adoptPet,
  applyChannelRestriction,
  feedPet,
  handleVerifyButton,
  massSyncCategoryPermissions,
  petStatus,
  petStatusText,
  playPet,
  resetPet,
  runBump,
  sendVerificationPanel
};
