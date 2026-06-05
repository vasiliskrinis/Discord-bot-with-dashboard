const CONFIG_KEY = 'invite_role_mappings';
const COUNT_REWARD_CONFIG_KEY = 'invite_count_role_rewards';

function normalizeInviteCode(value) {
  let text = String(value || '').trim().replace(/[<>]/g, '');
  if (!text) return '';

  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'discord.gg') {
      text = parts[0] || '';
    } else if (url.hostname.endsWith('discord.com') || url.hostname.endsWith('discordapp.com')) {
      const inviteIndex = parts.findIndex((part) => part.toLowerCase() === 'invite');
      text = inviteIndex >= 0 ? parts[inviteIndex + 1] || '' : parts.at(-1) || text;
    }
  } catch {
    const inviteMatch = text.match(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([^/?#\s]+)/i);
    if (inviteMatch) text = inviteMatch[1];
  }

  return text.split(/[/?#\s]/)[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
}

function normalizeRoleId(value) {
  return String(value || '').replace(/[<@&>]/g, '').trim();
}

function normalizeInviteCount(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function normalizeInviteRoleMappings(value) {
  const mappings = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  for (const item of mappings) {
    const code = normalizeInviteCode(item?.code || item?.invite || item?.inviteCode);
    const roleId = normalizeRoleId(item?.roleId || item?.role_id || item?.role);
    if (!code || !roleId || seen.has(code)) continue;
    seen.add(code);
    normalized.push({ code, roleId });
  }
  return normalized;
}

function listInviteRoleMappings(db, guildId) {
  return normalizeInviteRoleMappings(db.getConfig(guildId, CONFIG_KEY, []));
}

function saveInviteRoleMappings(db, guildId, mappings) {
  const normalized = normalizeInviteRoleMappings(mappings);
  db.setConfig(guildId, CONFIG_KEY, normalized);
  return normalized;
}

function setInviteRoleMapping(db, guildId, inviteCode, roleId) {
  const code = normalizeInviteCode(inviteCode);
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!code) throw new Error('Invite code is required.');
  if (!normalizedRoleId) throw new Error('Role is required.');

  const mappings = listInviteRoleMappings(db, guildId);
  const existingIndex = mappings.findIndex((item) => item.code === code);
  const mapping = { code, roleId: normalizedRoleId };
  const replaced = existingIndex >= 0;
  if (replaced) mappings[existingIndex] = mapping;
  else mappings.push(mapping);
  saveInviteRoleMappings(db, guildId, mappings);
  return { mapping, mappings, replaced };
}

function removeInviteRoleMapping(db, guildId, inviteCode) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) throw new Error('Invite code is required.');
  const mappings = listInviteRoleMappings(db, guildId);
  const removed = mappings.find((item) => item.code === code) || null;
  saveInviteRoleMappings(db, guildId, mappings.filter((item) => item.code !== code));
  return { code, removed };
}

function findInviteRoleMapping(db, guildId, inviteCode) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) return null;
  return listInviteRoleMappings(db, guildId).find((item) => item.code === code) || null;
}

function formatInviteRoleMappings(guild, mappings) {
  const rows = normalizeInviteRoleMappings(mappings);
  if (!rows.length) return 'No invite role mappings configured.';
  return rows
    .map((mapping) => `\`${mapping.code}\` -> ${roleMentionOrLabel(guild, mapping.roleId)}`)
    .join('\n');
}

function normalizeInviteCountRoleRewards(value) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([invites, role]) => (
          role && typeof role === 'object'
            ? { invites, ...role }
            : { invites, roleId: role }
        ))
      : [];

  const byCount = new Map();
  for (const row of rows) {
    const invites = normalizeInviteCount(row?.invites ?? row?.count ?? row?.required ?? row?.threshold);
    const roleId = normalizeRoleId(row?.roleId || row?.role_id || row?.role);
    if (!invites || !roleId) continue;
    byCount.set(invites, { invites, roleId });
  }

  return [...byCount.values()].sort((a, b) => a.invites - b.invites);
}

function listInviteCountRoleRewards(db, guildId) {
  return normalizeInviteCountRoleRewards(db.getConfig(guildId, COUNT_REWARD_CONFIG_KEY, []));
}

function saveInviteCountRoleRewards(db, guildId, rewards) {
  const normalized = normalizeInviteCountRoleRewards(rewards);
  db.setConfig(guildId, COUNT_REWARD_CONFIG_KEY, normalized);
  return normalized;
}

function setInviteCountRoleReward(db, guildId, invites, roleId) {
  const count = normalizeInviteCount(invites);
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!count) throw new Error('Invite count must be at least 1.');
  if (!normalizedRoleId) throw new Error('Role is required.');

  const rewards = listInviteCountRoleRewards(db, guildId);
  const existingIndex = rewards.findIndex((item) => item.invites === count);
  const reward = { invites: count, roleId: normalizedRoleId };
  const replaced = existingIndex >= 0;
  if (replaced) rewards[existingIndex] = reward;
  else rewards.push(reward);
  saveInviteCountRoleRewards(db, guildId, rewards);
  return { reward, rewards: normalizeInviteCountRoleRewards(rewards), replaced };
}

function removeInviteCountRoleReward(db, guildId, invites) {
  const count = normalizeInviteCount(invites);
  if (!count) throw new Error('Invite count must be at least 1.');
  const rewards = listInviteCountRoleRewards(db, guildId);
  const removed = rewards.find((item) => item.invites === count) || null;
  saveInviteCountRoleRewards(db, guildId, rewards.filter((item) => item.invites !== count));
  return { invites: count, removed };
}

function inviteCountRoleRewardsForCount(db, guildId, count) {
  const total = normalizeInviteCount(count) || 0;
  return listInviteCountRoleRewards(db, guildId).filter((reward) => total >= reward.invites);
}

function formatInviteCountRoleRewards(guild, rewards) {
  const rows = normalizeInviteCountRoleRewards(rewards);
  if (!rows.length) return 'No invite-count role rewards configured.';
  return rows
    .map((reward) => `**${reward.invites}** invite${reward.invites === 1 ? '' : 's'} -> ${roleMentionOrLabel(guild, reward.roleId)}`)
    .join('\n');
}

function roleMentionOrLabel(guild, roleId) {
  const role = guild?.roles?.cache?.get?.(String(roleId));
  return role ? `${role}` : `<@&${roleId}>`;
}

module.exports = {
  CONFIG_KEY,
  COUNT_REWARD_CONFIG_KEY,
  normalizeInviteCode,
  normalizeInviteRoleMappings,
  normalizeInviteCountRoleRewards,
  listInviteRoleMappings,
  saveInviteRoleMappings,
  setInviteRoleMapping,
  removeInviteRoleMapping,
  findInviteRoleMapping,
  formatInviteRoleMappings,
  listInviteCountRoleRewards,
  saveInviteCountRoleRewards,
  setInviteCountRoleReward,
  removeInviteCountRoleReward,
  inviteCountRoleRewardsForCount,
  formatInviteCountRoleRewards
};
