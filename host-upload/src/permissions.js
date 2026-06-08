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

function isConfiguredModerator(db, member) {
  if (!member?.guild) return false;
  if (isConfiguredAdmin(db, member)) return true;
  const guildId = member.guild.id;
  const moderatorUsers = db.getConfig(guildId, 'moderator_users', []);
  const moderatorRoles = db.getConfig(guildId, 'moderator_roles', []);
  const moderationCommandRoles = db.getConfig(guildId, 'moderation_command_roles', []);
  return moderatorUsers.includes(member.id) ||
    memberHasAnyRole(member, moderatorRoles) ||
    memberHasAnyRole(member, moderationCommandRoles);
}

function isGuildAdmin(db, member) {
  if (!member?.guild) return false;
  if (isConfiguredAdmin(db, member)) return true;
  if (member.id === member.guild.ownerId) return true;
  return false;
}

function isGuildModerator(db, member) {
  if (!member?.guild) return false;
  if (isGuildAdmin(db, member)) return true;
  return isConfiguredModerator(db, member);
}

function canRestrict(db, member) {
  if (!member?.guild) return false;
  if (isGuildModerator(db, member)) return true;
  const roleId = db.getConfig(member.guild.id, 'restrict_perms_role');
  return Boolean(roleId && member.roles.cache.has(roleId));
}

function canUseRestrictButtons(db, member) {
  if (!member?.guild) return false;
  if (isGuildModerator(db, member)) return true;
  const roles = db.getConfig(member.guild.id, 'authorized_roles', []);
  return memberHasAnyRole(member, roles);
}

function isHeadOfOperations(db, member) {
  if (!member?.guild) return false;
  if (isBotOwner(member.id)) return true;
  const roleId = db.getConfig(member.guild.id, 'head_of_operations_role');
  return Boolean(roleId && member.roles.cache.has(roleId));
}

function canManageStaffSystem(db, member) {
  if (!member?.guild) return false;
  if (isBotOwner(member.id)) return true;
  if (isHeadOfOperations(db, member)) return true;
  if (isGuildAdmin(db, member)) return true;
  return false;
}

function canUseStaffSystem(db, member) {
  if (!member?.guild) return false;
  if (canManageStaffSystem(db, member)) return true;
  if (isGuildModerator(db, member)) return true;
  const roles = db.getConfig(member.guild.id, 'staff_command_roles', []);
  return memberHasAnyRole(member, roles);
}

function requireBotOwner(userId) {
  if (!isBotOwner(userId)) {
    throw new Error('Only the protected bot owner can use this.');
  }
}

function requireModerator(db, member) {
  if (!isGuildModerator(db, member)) {
    throw new Error('You need dashboard moderator or admin access.');
  }
}

function requireAdmin(db, member) {
  if (!isGuildAdmin(db, member)) {
    throw new Error('You need dashboard admin access or server owner access.');
  }
}

function requireRestrict(db, member) {
  if (!canRestrict(db, member)) {
    throw new Error('You need the configured restrict permissions role or dashboard moderator/admin access.');
  }
}

function requireStaff(db, member) {
  if (!canUseStaffSystem(db, member)) {
    throw new Error('You need a configured Command Staff role or bot owner access.');
  }
}

function requireStaffManager(db, member) {
  if (!canManageStaffSystem(db, member)) {
    throw new Error('You need the configured Head Of Operations role, dashboard admin access, or bot owner access.');
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
  isConfiguredModerator,
  isGuildAdmin,
  isGuildModerator,
  canRestrict,
  canUseRestrictButtons,
  isHeadOfOperations,
  canManageStaffSystem,
  canUseStaffSystem,
  requireBotOwner,
  requireAdmin,
  requireModerator,
  requireRestrict,
  requireStaff,
  requireStaffManager,
  manageable
};
