const { PermissionsBitField } = require('discord.js');
const env = require('./env');

function isBotOwner(userId) {
  return Boolean(env.botOwnerId && userId === env.botOwnerId);
}

function memberHasAnyRole(member, roleIds = []) {
  if (!member || !roleIds.length) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function isConfiguredAdmin(db, member) {
  if (!member?.guild) return false;
  if (isBotOwner(member.id)) return true;
  const guildId = member.guild.id;
  const adminUsers = db.getConfig(guildId, 'admin_users', []);
  const adminRoles = db.getConfig(guildId, 'admin_roles', []);
  return adminUsers.includes(member.id) || memberHasAnyRole(member, adminRoles);
}

function isGuildModerator(db, member) {
  if (!member?.guild) return false;
  if (isConfiguredAdmin(db, member)) return true;
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
    member.permissions.has(PermissionsBitField.Flags.BanMembers);
}

function canRestrict(db, member) {
  if (!member?.guild) return false;
  if (isGuildModerator(db, member)) return true;
  const roleId = db.getConfig(member.guild.id, 'restrict_perms_role');
  return Boolean(roleId && member.roles.cache.has(roleId));
}

function canUseRestrictButtons(db, member) {
  if (!member?.guild) return false;
  if (isConfiguredAdmin(db, member)) return true;
  const roles = db.getConfig(member.guild.id, 'authorized_roles', []);
  return memberHasAnyRole(member, roles);
}

function requireBotOwner(userId) {
  if (!isBotOwner(userId)) {
    throw new Error('Only the protected bot owner can use this.');
  }
}

function requireModerator(db, member) {
  if (!isGuildModerator(db, member)) {
    throw new Error('You need moderator permissions or configured admin access.');
  }
}

function requireRestrict(db, member) {
  if (!canRestrict(db, member)) {
    throw new Error('You need the configured restrict permissions role or moderator access.');
  }
}

function manageable(member, targetMember) {
  if (!member?.guild || !targetMember?.guild) return false;
  if (isBotOwner(targetMember.id)) return false;
  if (isBotOwner(member.id)) return true;
  if (member.id === member.guild.ownerId) return true;
  return member.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

module.exports = {
  isBotOwner,
  isConfiguredAdmin,
  isGuildModerator,
  canRestrict,
  canUseRestrictButtons,
  requireBotOwner,
  requireModerator,
  requireRestrict,
  manageable
};
