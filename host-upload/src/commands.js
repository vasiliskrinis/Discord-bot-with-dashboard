const {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');
const path = require('node:path');
const env = require('./env');
const { DEFAULT_GUILD_CONFIG } = require('./db');
const { buildEmbed, error, success, EMBED_STYLES } = require('./embeds');
const { parseDuration, formatDuration } = require('./time');
const { isBotOwner, requireAdmin, requireBotOwner, requireModerator, requireRestrict } = require('./permissions');
const restrictions = require('./services/restrictions');
const tickets = require('./services/tickets');
const games = require('./services/games');
const progression = require('./services/progression');
const community = require('./services/community');
const swat = require('./services/swat');
const { createEmbedFromAI } = require('./services/ai');
const inviteRoles = require('./services/inviteRoles');
const { moderationLog } = require('./services/logger');

const SETUP_CHANNELS = [
  {
    key: 'restrict_channel',
    label: 'Restrict Trap Channel',
    description: 'Messages here automatically restrict the sender.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'advanced_logs_channel',
    label: 'Advanced Logs',
    description: 'Server and moderator action logs.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'restrict_logs_channel',
    label: 'Restrict Logs',
    description: 'Restrict/unrestrict logs with review buttons.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'restricted_users_channel',
    label: 'Restricted Users',
    description: 'Final accepted/declined restriction decisions.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'roblox_updates_channel',
    label: 'Roblox Updates',
    description: 'Roblox API update notifications.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'executor_updates_channel',
    label: 'Executor Updates',
    description: 'Executor API update notifications.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'verification_channel',
    label: 'Verification Channel',
    description: 'Channel where the verification panel is posted.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'bump_channel',
    label: 'Bump Channel',
    description: 'Channel for bump messages.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'qna_channel',
    label: 'Q&A Channel',
    description: 'Channel where the Q&A personality answers questions.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'counting_channel',
    label: 'Counting Channel',
    description: 'Counting game channel.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'welcome_channel',
    label: 'Welcome Channel',
    description: 'Welcome message channel.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'achievement_channel',
    label: 'Achievement Channel',
    description: 'Achievement unlock announcements.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'level_announce_channel',
    label: 'Level Announcements',
    description: 'Level-up and achievement announcements.',
    types: [ChannelType.GuildText]
  },
  {
    key: 'member_count_voice',
    label: 'Member Count Voice',
    description: 'Voice channel renamed with member count.',
    types: [ChannelType.GuildVoice]
  }
];

const SETUP_SINGLE_ROLES = [
  {
    key: 'restrict_perms_role',
    label: 'Restrict Perms Role',
    description: 'Role allowed to restrict and unrestrict.'
  },
  {
    key: 'restricted_role',
    label: 'Restricted Role',
    description: 'Role given to restricted members.'
  },
  {
    key: 'update_ping_role',
    label: 'Update Ping Role',
    description: 'Role pinged for Roblox/executor updates.'
  },
  {
    key: 'verified_role',
    label: 'Verified Role',
    description: 'Role given when a member verifies.'
  },
  {
    key: 'swat_guess_role',
    label: 'SWAT Guess Reward',
    description: 'Role given to first correct episode guesser.'
  },
  {
    key: 'auto_role',
    label: 'Auto Role',
    description: 'Role automatically given to new human members.'
  }
];

const SETUP_LISTS = [
  {
    key: 'admin_users',
    label: 'Admin Users',
    description: 'Users allowed to use bot admin/mod setup.',
    type: 'user'
  },
  {
    key: 'admin_roles',
    label: 'Admin Roles',
    description: 'Roles allowed to use bot admin/mod setup.',
    type: 'role'
  },
  {
    key: 'authorized_roles',
    label: 'Restrict Review Roles',
    description: 'Roles allowed to use Accept/Decline/Review.',
    type: 'role'
  }
];

const SETUP_TEXT_ACTIONS = [
  {
    key: 'welcome',
    label: 'Welcome Message',
    description: 'Set the welcome text template.'
  },
  {
    key: 'sticky',
    label: 'Sticky Message',
    description: 'Set sticky message for the current channel.'
  },
  {
    key: 'ticket',
    label: 'Ticket Panel',
    description: 'Create a ticket panel in the current channel.'
  }
];

const SETUP_CLEAR_ITEMS = [
  ...SETUP_CHANNELS,
  ...SETUP_SINGLE_ROLES,
  ...SETUP_LISTS,
  { key: 'welcome_message', label: 'Welcome Message', description: 'Reset the welcome text template.' },
  { key: 'invite_role_mappings', label: 'Invite Role Mappings', description: 'Remove all invite-to-role mappings.' },
  { key: 'invite_count_role_rewards', label: 'Invite Count Role Rewards', description: 'Remove all invite-count role rewards.' },
  { key: 'sticky', label: 'Sticky Message', description: 'Delete the sticky message setting for this server.' }
];

const PREFIX_ALIASES = {
  lockchannel: 'lock',
  unlockchannel: 'unlock',
  lockdownserver: 'lockdown',
  unlockdownserver: 'unlockdown',
  unlockserver: 'unlockdown',
  giverole: 'give-role',
  removerole: 'remove-role',
  give_role: 'give-role',
  remove_role: 'remove-role',
  stealemoji: 'steal-emoji',
  stealsticker: 'steal-sticker',
  voicechatmute: 'voice-mute',
  vcmute: 'voice-mute',
  lockuser: 'lock-user',
  unlockuser: 'unlock-user',
  temprole: 'temp-role',
  temproleremove: 'temp-role-remove',
  temprolelist: 'temp-role-list',
  setnick: 'set-nick',
  massban: 'mass-ban',
  firstmessage: 'first-message',
  banlist: 'ban-list',
  embedcreate: 'embed-create',
  boosterrole: 'booster-role',
  bal: 'balance',
  coins: 'balance',
  economy: 'profile',
  rank: 'level',
  levels: 'leaderboard',
  rolelevel: 'role-level',
  rolelvl: 'role-level',
  setupmenu: 'setup',
  stickynote: 'sticky',
  stickymessage: 'sticky',
  channelrestriction: 'channel-restriction',
  masssynccategories: 'mass-sync-categories',
  syncchannels: 'mass-sync-categories',
  invite: 'invites',
  invitescount: 'invites',
  inviterole: 'invite-role',
  inviteroles: 'invite-role',
  roleinvites: 'role-invites',
  invitecountrole: 'role-invites',
  invitecountroles: 'role-invites',
  inviterewards: 'role-invites'
};

const OWNER_ALIASES = {
  guild: 'guilds',
  servers: 'guilds',
  leave: 'leaveguild',
  leaveguilds: 'leaveguild',
  serverconfig: 'serversettings',
  settings: 'serversettings',
  usage: 'commandusage',
  commandstats: 'commandusage',
  db: 'db',
  dbstats: 'dbstats',
  dbbackup: 'dbbackup',
  panicmode: 'panicmode',
  panicai: 'panicai',
  changeactivity: 'activity',
  setactivity: 'activity',
  blacklistuser: 'blacklist',
  unblacklistuser: 'unblacklist',
  blacklistguild: 'blacklist',
  unblacklistguild: 'unblacklist',
  banserver: 'blacklist',
  unbanserver: 'unblacklist',
  banmember: 'blacklist',
  unbanmember: 'unblacklist',
  restore: 'restoreuser',
  restore_user: 'restoreuser',
  restoreuser: 'restoreuser',
  role_fix: 'rolefix',
  rolefix: 'rolefix',
  ticket: 'ticketpanel',
  tickets: 'ticketpanel',
  ticketpanel: 'ticketpanel',
  force_unrestrict: 'forceunrestrict',
  forceunrestrict: 'forceunrestrict'
};

const LOCKED_NORMAL_COMMANDS = new Set([
  'restrict', 'unrestrict', 'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'unwarn',
  'softban', 'mass-ban', 'purge', 'dm', 'say', 'lock', 'unlock', 'lockdown', 'unlockdown',
  'slowmode', 'give-role', 'remove-role', 'voice-mute', 'lock-user', 'unlock-user',
  'temp-role', 'temp-role-remove', 'set-nick', 'move', 'giveaway', 'steal-emoji',
  'steal-sticker', 'embed-create', 'invite-role', 'role-invites'
]);

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

function slashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Open the organized setup menu for this server.'),

    new SlashCommandBuilder()
      .setName('restrict')
      .setDescription('Restrict a member, remove roles, save them, and add the restricted role.')
      .addUserOption((option) => option.setName('user').setDescription('Member to restrict.').setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Optional duration like 10m, 2h, 7d.'))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('unrestrict')
      .setDescription('Unrestrict a member and restore saved roles.')
      .addUserOption((option) => option.setName('user').setDescription('Member to unrestrict.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a user.')
      .addUserOption((option) => option.setName('user').setDescription('User to ban.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID.')
      .addStringOption((option) => option.setName('user_id').setDescription('User ID.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to kick.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Timeout/mute a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to mute.').setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Duration like 10m, 1h, 7d.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Remove timeout/mute from a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to unmute.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to warn.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('unwarn')
      .setDescription('Remove a warning by case ID.')
      .addIntegerOption((option) => option.setName('case_id').setDescription('Warning case ID.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Show active warnings for a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Set yourself AFK.')
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Create a reaction poll. Options are separated by |.')
      .addStringOption((option) => option.setName('question').setDescription('Question.').setRequired(true))
      .addStringOption((option) => option.setName('options').setDescription('Example: Yes | No | Maybe').setRequired(true)),

    new SlashCommandBuilder()
      .setName('steal-emoji')
      .setDescription('Steal a custom emoji by emoji mention or image URL.')
      .addStringOption((option) => option.setName('source').setDescription('Emoji mention or image URL.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('New emoji name.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('steal-sticker')
      .setDescription('Create a sticker from an image URL.')
      .addStringOption((option) => option.setName('url').setDescription('Image URL.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('Sticker name.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('dm')
      .setDescription('DM a user.')
      .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
      .addStringOption((option) => option.setName('message').setDescription('Message.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something.')
      .addStringOption((option) => option.setName('message').setDescription('Message.').setRequired(true)),

    new SlashCommandBuilder().setName('help').setDescription('Show all commands.'),
    new SlashCommandBuilder().setName('ping').setDescription('Show bot latency.'),

    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock a channel.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock a channel.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder().setName('lockdown').setDescription('Lock all text channels.'),
    new SlashCommandBuilder().setName('unlockdown').setDescription('Unlock all text channels.'),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Bulk delete messages.')
      .addIntegerOption((option) => option.setName('amount').setDescription('1-100 messages.').setRequired(true).setMinValue(1).setMaxValue(100)),

    new SlashCommandBuilder()
      .setName('note')
      .setDescription('Add or show moderator notes.')
      .addStringOption((option) => option.setName('action').setDescription('add/list').setRequired(true).addChoices(
        { name: 'add', value: 'add' },
        { name: 'list', value: 'list' }
      ))
      .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
      .addStringOption((option) => option.setName('note').setDescription('Note text.')),

    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set channel slowmode in seconds.')
      .addIntegerOption((option) => option.setName('seconds').setDescription('0-21600 seconds.').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
      .setName('softban')
      .setDescription('Ban then unban a user to remove messages.')
      .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('give-role')
      .setDescription('Give a role to a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('remove-role')
      .setDescription('Remove a role from a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Show user info.')
      .addUserOption((option) => option.setName('user').setDescription('User.')),

    new SlashCommandBuilder()
      .setName('voice-mute')
      .setDescription('Server mute a member in voice.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addBooleanOption((option) => option.setName('muted').setDescription('Muted state.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('lock-user')
      .setDescription('Lock a user from sending messages in a channel.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
      .setName('unlock-user')
      .setDescription('Unlock a user from sending messages in a channel.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
      .setName('temp-role')
      .setDescription('Give a temporary role.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Duration like 1h, 7d.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('temp-role-remove')
      .setDescription('Remove a temporary role entry and role.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('temp-role-list')
      .setDescription('List temporary roles.')
      .addUserOption((option) => option.setName('user').setDescription('Member.')),

    new SlashCommandBuilder().setName('snipe').setDescription('Show the last deleted message in this channel.'),

    new SlashCommandBuilder()
      .setName('set-nick')
      .setDescription('Set a member nickname.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addStringOption((option) => option.setName('nickname').setDescription('New nickname.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Set a reminder.')
      .addStringOption((option) => option.setName('duration').setDescription('Duration like 10m, 2h.').setRequired(true))
      .addStringOption((option) => option.setName('message').setDescription('Reminder message.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Create or reroll giveaways.')
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Create a giveaway.')
          .addStringOption((option) => option.setName('duration').setDescription('Duration like 1h, 1d.').setRequired(true))
          .addStringOption((option) => option.setName('prize').setDescription('Prize.').setRequired(true))
          .addIntegerOption((option) => option.setName('winners').setDescription('Winner count.').setMinValue(1).setMaxValue(20))
      )
      .addSubcommand((sub) =>
        sub
          .setName('reroll')
          .setDescription('Reroll a giveaway.')
          .addStringOption((option) => option.setName('giveaway_id').setDescription('Giveaway ID.').setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName('move')
      .setDescription('Move a member to another voice channel.')
      .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
      .addChannelOption((option) => option.setName('channel').setDescription('Voice channel.').setRequired(true).addChannelTypes(ChannelType.GuildVoice)),

    new SlashCommandBuilder()
      .setName('mass-ban')
      .setDescription('Ban multiple user IDs separated by commas or spaces.')
      .addStringOption((option) => option.setName('user_ids').setDescription('IDs separated by comma or spaces.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason.')),

    new SlashCommandBuilder()
      .setName('first-message')
      .setDescription('Find the first message in a channel.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel.').addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
      .setName('case')
      .setDescription('Show, change, or delete moderation cases.')
      .addSubcommand((sub) =>
        sub
          .setName('show')
          .setDescription('Show a case.')
          .addIntegerOption((option) => option.setName('case_id').setDescription('Case ID.').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('change')
          .setDescription('Change a case reason.')
          .addIntegerOption((option) => option.setName('case_id').setDescription('Case ID.').setRequired(true))
          .addStringOption((option) => option.setName('reason').setDescription('New reason.').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('delete')
          .setDescription('Delete a case.')
          .addIntegerOption((option) => option.setName('case_id').setDescription('Case ID.').setRequired(true))
      ),

    new SlashCommandBuilder().setName('ban-list').setDescription('Show banned users.'),

    new SlashCommandBuilder()
      .setName('embed-create')
      .setDescription('Describe an embed and let AI create it.')
      .addStringOption((option) => option.setName('description').setDescription('Describe the embed.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('booster-role')
      .setDescription('Create or update your booster custom role.')
      .addStringOption((option) => option.setName('name').setDescription('Role name.').setRequired(true))
      .addStringOption((option) => option.setName('color').setDescription('Hex color like #ff00aa.'))
      .addStringOption((option) => option.setName('image_url').setDescription('Optional role icon URL.')),

    new SlashCommandBuilder()
      .setName('game')
      .setDescription('Play a game.')
      .addStringOption((option) =>
        option.setName('name').setDescription('Game.').setRequired(true).addChoices(
          { name: 'tictactoe', value: 'tictactoe' },
          { name: 'coinflip', value: 'coinflip' },
          { name: 'dice', value: 'dice' },
          { name: 'rps', value: 'rps' },
          { name: '8ball', value: '8ball' },
          { name: 'slots', value: 'slots' },
          { name: 'trivia', value: 'trivia' },
          { name: 'roulette', value: 'roulette' },
          { name: 'scramble', value: 'scramble' }
        )
      )
      .addUserOption((option) => option.setName('opponent').setDescription('Opponent for tic tac toe.')),

    new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Show a member coin balance.')
      .addUserOption((option) => option.setName('user').setDescription('Member.')),

    new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Claim your daily economy reward.'),

    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Show level, coins, messages, streak, and achievements.')
      .addUserOption((option) => option.setName('user').setDescription('Member.')),

    new SlashCommandBuilder()
      .setName('level')
      .setDescription('Show a member level.')
      .addUserOption((option) => option.setName('user').setDescription('Member.')),

    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the server XP or coin leaderboard.')
      .addStringOption((option) => option.setName('type').setDescription('Leaderboard type.').addChoices(
        { name: 'XP', value: 'xp' },
        { name: 'Coins', value: 'balance' }
      )),

    new SlashCommandBuilder()
      .setName('role-level')
      .setDescription('Manage role rewards by level.')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add or replace a level role reward.')
          .addIntegerOption((option) => option.setName('level').setDescription('Required level.').setRequired(true).setMinValue(1).setMaxValue(500))
          .addRoleOption((option) => option.setName('role').setDescription('Reward role.').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a level role reward.')
          .addIntegerOption((option) => option.setName('level').setDescription('Reward level.').setRequired(true).setMinValue(1).setMaxValue(500))
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List configured level role rewards.')
      ),

    new SlashCommandBuilder()
      .setName('verification')
      .setDescription('Set up or show the verification system.')
      .addSubcommand((sub) =>
        sub
          .setName('setup')
          .setDescription('Post a verification button panel.')
          .addChannelOption((option) => option.setName('channel').setDescription('Verification channel.').setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addRoleOption((option) => option.setName('role').setDescription('Role to give after verification.').setRequired(true))
          .addStringOption((option) => option.setName('message').setDescription('Panel message.'))
      )
      .addSubcommand((sub) => sub.setName('status').setDescription('Show verification settings.')),

    new SlashCommandBuilder()
      .setName('channel-restriction')
      .setDescription('Apply restricted-role visibility denies to all channels except selected IDs.')
      .addStringOption((option) => option.setName('except').setDescription('Channel mentions/IDs to leave visible, separated by spaces or commas.')),

    new SlashCommandBuilder()
      .setName('mass-sync-categories')
      .setDescription('Sync all child channels with their category permissions.'),

    new SlashCommandBuilder()
      .setName('bump')
      .setDescription('Bump the server with the configured cooldown.'),

    new SlashCommandBuilder()
      .setName('pet')
      .setDescription('Digital pet ecosystem.')
      .addSubcommand((sub) =>
        sub
          .setName('adopt')
          .setDescription('Adopt your digital pet.')
          .addStringOption((option) => option.setName('name').setDescription('Pet name.'))
      )
      .addSubcommand((sub) => sub.setName('feed').setDescription('Feed your digital pet.'))
      .addSubcommand((sub) => sub.setName('play').setDescription('Play with your digital pet.'))
      .addSubcommand((sub) => sub.setName('status').setDescription('Show your digital pet.')),

    new SlashCommandBuilder()
      .setName('qna')
      .setDescription('Configure the Q&A channel personality.')
      .addSubcommand((sub) =>
        sub
          .setName('setup')
          .setDescription('Set the Q&A channel and personality.')
          .addChannelOption((option) => option.setName('channel').setDescription('Q&A channel.').setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addStringOption((option) => option.setName('personality').setDescription('How the bot should answer in Q&A.').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('status').setDescription('Show Q&A settings.')),

    new SlashCommandBuilder()
      .setName('invite-role')
      .setDescription('Give roles to members who join through specific invite codes.')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Map an invite code or URL to a role.')
          .addStringOption((option) => option.setName('invite').setDescription('Invite code or full invite URL.').setRequired(true))
          .addRoleOption((option) => option.setName('role').setDescription('Role to give when this invite is used.').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove an invite role mapping.')
          .addStringOption((option) => option.setName('invite').setDescription('Invite code or full invite URL.').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('List invite role mappings.')),

    new SlashCommandBuilder()
      .setName('role-invites')
      .setDescription('Give inviters a role when they reach an invite count.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addIntegerOption((option) => option.setName('invites').setDescription('Invite count required.').setRequired(true).setMinValue(1).setMaxValue(1000000))
      .addRoleOption((option) => option.setName('role').setDescription('Role to give when that invite count is reached.').setRequired(true)),

    new SlashCommandBuilder()
      .setName('invites')
      .setDescription('Check your invite count, or a member invite count if you are a moderator.')
      .addStringOption((option) => option.setName('action').setDescription('Check or reset tracked invites.').addChoices(
        { name: 'check', value: 'check' },
        { name: 'reset', value: 'reset' }
      ))
      .addUserOption((option) => option.setName('user').setDescription('Member to check/reset. Moderators only for other members.'))
      .addBooleanOption((option) => option.setName('all').setDescription('Reset all tracked invite stats. Moderator only.'))
  ];

  return commands.map((command) => command.toJSON());
}

async function registerSlashCommands(client) {
  const commands = slashCommands();
  let registered = 0;

  if (client.application) {
    await client.application.commands.set([]);
  }

  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(commands);
    registered += 1;
  }

  return `Cleared global slash commands and registered ${commands.length} slash commands in ${registered} guild${registered === 1 ? '' : 's'}.`;
}

async function reply(target, payload, ephemeral = false) {
  if (target.reply && target.commandName) {
    const body = { ...payload, ephemeral };
    if (target.deferred || target.replied) return target.followUp(body);
    return target.reply(body);
  }
  return target.reply(payload);
}

function splitArgs(input) {
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let match;
  while ((match = re.exec(input))) {
    args.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  return args;
}

function idFromMention(value) {
  if (!value) return null;
  return String(value).replace(/[<@!#&>]/g, '');
}

async function resolveMember(guild, value) {
  const id = idFromMention(value);
  if (!id) return null;
  return guild.members.fetch(id).catch(() => null);
}

async function resolveUser(client, guild, value) {
  const id = idFromMention(value);
  if (!id) return null;
  const member = await guild.members.fetch(id).catch(() => null);
  if (member) return member.user;
  return client.users.fetch(id).catch(() => null);
}

function normalizeCommand(name) {
  const key = String(name || '').toLowerCase();
  return PREFIX_ALIASES[key] || key;
}

function normalizeOwnerCommand(name) {
  const key = String(name || '').toLowerCase().replace(/[-_]/g, '');
  return OWNER_ALIASES[key] || key;
}

function matchesPrefix(content, prefix) {
  if (!content.startsWith(prefix)) return false;
  const next = content[prefix.length];
  const last = prefix[prefix.length - 1];
  if (!next) return true;
  if (/\s/.test(next)) return true;
  return /[^a-z0-9]/i.test(last);
}

function ensureGuild(interactionOrMessage) {
  if (!interactionOrMessage.guild) throw new Error('This command can only be used in a server.');
}

function reasonOr(args, fallback = 'No reason provided') {
  return args.filter(Boolean).join(' ') || fallback;
}

function getTargetMemberFromSlash(interaction, name = 'user') {
  const member = interaction.options.getMember(name);
  if (!member) throw new Error('That member is not in this server.');
  return member;
}

function assertNotProtectedOwner(userId) {
  if (isBotOwner(userId)) {
    throw new Error('The protected bot owner bypasses moderation actions.');
  }
}

function assertNormalCommandUnlocked(db, command) {
  const flags = db.runtimeFlags();
  if (flags.panicMode) throw new Error('Panic mode is active. Only bot owner commands are available.');
  if (flags.maintenance) throw new Error('Maintenance mode is active. Only bot owner commands are available.');
  if (flags.botLocked && LOCKED_NORMAL_COMMANDS.has(command)) {
    throw new Error('Bot lock is active. AI actions, moderation, tickets, and dangerous commands are disabled.');
  }
}

function assertAiFeaturesAvailable(db) {
  const flags = db.runtimeFlags();
  if (flags.panicMode || flags.maintenance || flags.botLocked || flags.aiLocked) {
    throw new Error('AI features are locked by the bot owner.');
  }
}

function runtimeFlagSummary(flags) {
  return [
    `Maintenance: **${flags.maintenance ? 'ON' : 'OFF'}**`,
    `Panic mode: **${flags.panicMode ? 'ON' : 'OFF'}**`,
    `AI panic: **${flags.aiLocked ? 'ON' : 'OFF'}**`,
    `Bot lock: **${flags.botLocked ? 'ON' : 'OFF'}**`
  ].join('\n');
}

function setupHomePayload(db, guildId) {
  db.ensureGuildConfig(guildId);
  return {
    embeds: [setupOverviewEmbed(db, guildId)],
    components: [setupSectionRow()]
  };
}

function setupOverviewEmbed(db, guildId) {
  const config = db.getAllConfig(guildId);
  return buildEmbed(db, guildId, {
    title: 'Server Setup',
    description: 'Choose a setup category from the menu below.',
    fields: [
      {
        name: 'Roles',
        value: setupConfiguredSection(SETUP_SINGLE_ROLES, config, roleValue)
      },
      {
        name: 'Channels',
        value: setupConfiguredSection(SETUP_CHANNELS, config, channelValue)
      },
      {
        name: 'Access',
        value: setupConfiguredSection(SETUP_LISTS, config, countValue, 'Empty'),
        inline: true
      },
      {
        name: 'Style',
        value: `\`${config.embed_style || 'sapphire'}\``,
        inline: true
      }
    ],
    style: 'royal'
  });
}

function setupConfiguredSection(items, config, formatter, missingLabel = 'Missing') {
  const configured = [];
  const missing = [];
  for (const item of items) {
    const value = config[item.key];
    if (hasSetupValue(value)) configured.push(setupLine(item.label, formatter(value)));
    else missing.push(item.label);
  }
  if (missing.length) configured.push(`**${missingLabel}:** ${missing.join(', ')}`);
  return configured.join('\n') || '`Nothing configured yet`';
}

function hasSetupValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

function setupLine(label, value) {
  return `**${label}:** ${value}`;
}

function roleValue(id) {
  return id ? `<@&${id}>` : '`Not set`';
}

function channelValue(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function countValue(items) {
  return Array.isArray(items) && items.length ? `${items.length} configured` : '`None`';
}

function setupSectionRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:section')
      .setPlaceholder('Choose what you want to configure')
      .addOptions(
        { label: 'Channels', value: 'channels', description: 'Logs, restrict, updates, counting, welcome.' },
        { label: 'Roles', value: 'roles', description: 'Restrict role, restrict perms, update ping.' },
        { label: 'Admins & Access', value: 'access', description: 'Admin users, admin roles, review roles.' },
        { label: 'Embed Style', value: 'style', description: 'Change the embed style used by the bot.' },
        { label: 'Messages & Tickets', value: 'text', description: 'Welcome message, sticky message, ticket panel.' },
        { label: 'Clear Settings', value: 'clear', description: 'Clear channels, roles, access lists, welcome, or sticky.' },
        { label: 'Current Config', value: 'overview', description: 'Show the current setup overview.' }
      )
  );
}

function setupBackRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:home')
      .setLabel('Back to Setup')
      .setStyle(ButtonStyle.Secondary)
  );
}

function setupChannelKindRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:channel-kind')
      .setPlaceholder('Choose a channel setting')
      .addOptions(
        SETUP_CHANNELS.map((item) => ({
          label: item.label,
          value: item.key,
          description: item.description
        }))
      )
  );
}

function setupSingleRoleKindRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:role-kind')
      .setPlaceholder('Choose a role setting')
      .addOptions(
        SETUP_SINGLE_ROLES.map((item) => ({
          label: item.label,
          value: item.key,
          description: item.description
        }))
      )
  );
}

function setupAccessKindRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:access-kind')
      .setPlaceholder('Choose an access list')
      .addOptions(
        SETUP_LISTS.map((item) => ({
          label: item.label,
          value: item.key,
          description: item.description
        }))
      )
  );
}

function setupStyleRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:style')
      .setPlaceholder('Choose an embed style')
      .addOptions(
        Object.entries(EMBED_STYLES).map(([key, value]) => ({
          label: value.name,
          value: key,
          description: `${value.icon} ${value.name}`.slice(0, 100)
        }))
      )
  );
}

function setupTextKindRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:text-kind')
      .setPlaceholder('Choose a message or ticket action')
      .addOptions(
        SETUP_TEXT_ACTIONS.map((item) => ({
          label: item.label,
          value: item.key,
          description: item.description
        }))
      )
  );
}

function setupClearRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:clear-kind')
      .setPlaceholder('Choose a setting to clear')
      .addOptions(
        SETUP_CLEAR_ITEMS.map((item) => ({
          label: item.label,
          value: item.key,
          description: item.description
        }))
      )
  );
}

function setupChannelSelectRow(key) {
  const item = SETUP_CHANNELS.find((entry) => entry.key === key);
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`setup:channel:${key}`)
      .setPlaceholder(`Select ${item?.label || 'channel'}`)
      .setMinValues(1)
      .setMaxValues(1)
      .setChannelTypes(...(item?.types || [ChannelType.GuildText]))
  );
}

function setupRoleSelectRow(key) {
  const item = SETUP_SINGLE_ROLES.find((entry) => entry.key === key);
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`setup:role:${key}`)
      .setPlaceholder(`Select ${item?.label || 'role'}`)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function setupListSelectRow(item) {
  if (item.type === 'user') {
    return new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`setup:list-user:${item.key}`)
        .setPlaceholder(`Select ${item.label} to toggle`)
        .setMinValues(1)
        .setMaxValues(10)
    );
  }

  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`setup:list-role:${item.key}`)
      .setPlaceholder(`Select ${item.label} to toggle`)
      .setMinValues(1)
      .setMaxValues(10)
  );
}

function setupModal(kind) {
  if (kind === 'welcome') {
    return new ModalBuilder()
      .setCustomId('setup:modal:welcome')
      .setTitle('Welcome Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Message template')
            .setPlaceholder('Welcome {user} to {server}. You are member #{memberCount}.')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1500)
        )
      );
  }

  if (kind === 'sticky') {
    return new ModalBuilder()
      .setCustomId('setup:modal:sticky')
      .setTitle('Sticky Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Sticky message for this channel')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1800)
        )
      );
  }

  return new ModalBuilder()
    .setCustomId('setup:modal:ticket')
    .setTitle('Ticket Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Panel name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1500)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('category_id')
          .setLabel('Ticket category ID optional')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(25)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('support_role_id')
          .setLabel('Support role ID optional')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(25)
      )
    );
}

async function clearSetupSetting(db, interaction, key) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_GUILD_CONFIG, key)) {
    throw new Error('That setup setting can not be cleared.');
  }

  const previous = db.getConfig(interaction.guild.id, key, DEFAULT_GUILD_CONFIG[key]);
  if (key === 'sticky' && previous?.channelId && previous?.lastMessageId) {
    const channel = await interaction.guild.channels.fetch(previous.channelId).catch(() => null);
    const stickyMessage = channel?.isTextBased()
      ? await channel.messages.fetch(previous.lastMessageId).catch(() => null)
      : null;
    await stickyMessage?.delete().catch(() => null);
  }

  db.setConfig(interaction.guild.id, key, DEFAULT_GUILD_CONFIG[key]);

  if (key === 'counting_channel') {
    db.setState(interaction.guild.id, 'counting_number', 0);
    db.setState(interaction.guild.id, 'counting_last_user', null);
  }

  await interaction.update({
    embeds: [success(db, interaction.guild.id, `Cleared \`${key}\`.`)],
    components: [setupSectionRow()]
  });
}

async function handleSetupInteraction(db, interaction) {
  ensureGuild(interaction);
  requireModerator(db, interaction.member);
  db.ensureGuildConfig(interaction.guild.id);

  if (interaction.isButton() && interaction.customId === 'setup:home') {
    await interaction.update(setupHomePayload(db, interaction.guild.id));
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0];

    if (interaction.customId === 'setup:section') {
      if (value === 'overview') {
        await interaction.update(setupHomePayload(db, interaction.guild.id));
        return true;
      }

      const payloads = {
        channels: {
          title: 'Channel Setup',
          description: 'Choose which channel setting to edit.',
          components: [setupChannelKindRow(), setupBackRow()]
        },
        roles: {
          title: 'Role Setup',
          description: 'Choose which role setting to edit.',
          components: [setupSingleRoleKindRow(), setupBackRow()]
        },
        access: {
          title: 'Admins & Access',
          description: 'Choose a list. Selecting an existing item removes it; selecting a new item adds it.',
          components: [setupAccessKindRow(), setupBackRow()]
        },
        style: {
          title: 'Embed Style',
          description: 'Choose the saved embed style for this server.',
          components: [setupStyleRow(), setupBackRow()]
        },
        text: {
          title: 'Messages & Tickets',
          description: 'Set welcome/sticky messages or create a ticket panel.',
          components: [setupTextKindRow(), setupBackRow()]
        },
        clear: {
          title: 'Clear Settings',
          description: 'Choose a saved setting to clear/reset for this server.',
          components: [setupClearRow(), setupBackRow()]
        }
      };

      const payload = payloads[value];
      if (!payload) return false;
      await interaction.update({
        embeds: [buildEmbed(db, interaction.guild.id, { title: payload.title, description: payload.description, style: 'royal' })],
        components: payload.components
      });
      return true;
    }

    if (interaction.customId === 'setup:channel-kind') {
      const item = SETUP_CHANNELS.find((entry) => entry.key === value);
      await interaction.update({
        embeds: [
          buildEmbed(db, interaction.guild.id, {
            title: item?.label || 'Channel Setup',
            description: 'Select the channel to save for this setting.',
            style: 'sapphire'
          })
        ],
        components: [setupChannelSelectRow(value), setupBackRow()]
      });
      return true;
    }

    if (interaction.customId === 'setup:role-kind') {
      const item = SETUP_SINGLE_ROLES.find((entry) => entry.key === value);
      await interaction.update({
        embeds: [
          buildEmbed(db, interaction.guild.id, {
            title: item?.label || 'Role Setup',
            description: 'Select the role to save for this setting.',
            style: 'sapphire'
          })
        ],
        components: [setupRoleSelectRow(value), setupBackRow()]
      });
      return true;
    }

    if (interaction.customId === 'setup:access-kind') {
      const item = SETUP_LISTS.find((entry) => entry.key === value);
      if (!item) return false;
      await interaction.update({
        embeds: [
          buildEmbed(db, interaction.guild.id, {
            title: item.label,
            description: `${item.description}\n\nSelect one or more items to toggle them.`,
            style: 'royal'
          })
        ],
        components: [setupListSelectRow(item), setupBackRow()]
      });
      return true;
    }

    if (interaction.customId === 'setup:style') {
      db.setConfig(interaction.guild.id, 'embed_style', value);
      await interaction.update({
        embeds: [success(db, interaction.guild.id, `Embed style changed to \`${value}\`.`)],
        components: [setupSectionRow()]
      });
      return true;
    }

    if (interaction.customId === 'setup:text-kind') {
      await interaction.showModal(setupModal(value));
      return true;
    }

    if (interaction.customId === 'setup:clear-kind') {
      await clearSetupSetting(db, interaction, value);
      return true;
    }
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('setup:channel:')) {
    const key = interaction.customId.split(':')[2];
    const channelId = interaction.values[0];
    db.setConfig(interaction.guild.id, key, channelId);

    if (key === 'counting_channel') {
      db.setState(interaction.guild.id, 'counting_number', 0);
      db.setState(interaction.guild.id, 'counting_last_user', null);
    }

    if (key === 'member_count_voice') {
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      await channel?.setName(`Members: ${interaction.guild.memberCount}`).catch(() => null);
    }

    await interaction.update({
      embeds: [success(db, interaction.guild.id, `Saved ${channelValue(channelId)} for \`${key}\`.`)],
      components: [setupSectionRow()]
    });
    return true;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('setup:role:')) {
    const key = interaction.customId.split(':')[2];
    const roleId = interaction.values[0];
    db.setConfig(interaction.guild.id, key, roleId);
    await interaction.update({
      embeds: [success(db, interaction.guild.id, `Saved ${roleValue(roleId)} for \`${key}\`.`)],
      components: [setupSectionRow()]
    });
    return true;
  }

  if (
    (interaction.isRoleSelectMenu() && interaction.customId.startsWith('setup:list-role:')) ||
    (interaction.isUserSelectMenu() && interaction.customId.startsWith('setup:list-user:'))
  ) {
    const key = interaction.customId.split(':')[2];
    const current = db.getConfig(interaction.guild.id, key, []);
    const added = [];
    const removed = [];

    for (const id of interaction.values) {
      if (current.includes(id)) {
        db.removeFromConfigArray(interaction.guild.id, key, id);
        removed.push(id);
      } else {
        db.addToConfigArray(interaction.guild.id, key, id);
        added.push(id);
      }
    }

    const mention = key.includes('users') ? (id) => `<@${id}>` : (id) => `<@&${id}>`;
    await interaction.update({
      embeds: [
        success(
          db,
          interaction.guild.id,
          [
            added.length ? `Added: ${added.map(mention).join(', ')}` : null,
            removed.length ? `Removed: ${removed.map(mention).join(', ')}` : null
          ].filter(Boolean).join('\n') || 'No changes made.'
        )
      ],
      components: [setupSectionRow()]
    });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('setup:modal:')) {
    const kind = interaction.customId.split(':')[2];

    if (kind === 'welcome') {
      const message = interaction.fields.getTextInputValue('message');
      db.setConfig(interaction.guild.id, 'welcome_message', message);
      await interaction.reply({
        embeds: [success(db, interaction.guild.id, 'Welcome message saved. Set the welcome channel from Setup > Channels.')],
        ephemeral: true
      });
      return true;
    }

    if (kind === 'sticky') {
      const message = interaction.fields.getTextInputValue('message');
      db.setConfig(interaction.guild.id, 'sticky', {
        channelId: interaction.channel.id,
        message,
        lastMessageId: null
      });
      await interaction.reply({
        embeds: [success(db, interaction.guild.id, `Sticky message saved for ${interaction.channel}.`)],
        ephemeral: true
      });
      return true;
    }

    if (kind === 'ticket') {
      if (db.runtimeFlags().botLocked) {
        throw new Error('Ticket setup is disabled by bot lock.');
      }
      await tickets.sendTicketPanel(db, interaction, {
        name: interaction.fields.getTextInputValue('name'),
        description: interaction.fields.getTextInputValue('description') || null,
        categoryId: interaction.fields.getTextInputValue('category_id') || null,
        supportRoleId: interaction.fields.getTextInputValue('support_role_id') || null
      });
      return true;
    }
  }

  return false;
}

async function handleSlash(interaction, db, client) {
  ensureGuild(interaction);
  const name = interaction.commandName;
  db.recordCommandUsage(name, 'slash', interaction.guild.id, interaction.user.id);

  try {
    assertNormalCommandUnlocked(db, name);
    switch (name) {
      case 'setup': {
        requireModerator(db, interaction.member);
        await reply(interaction, setupHomePayload(db, interaction.guild.id), true);
        break;
      }

      case 'restrict': {
        requireRestrict(db, interaction.member);
        const member = getTargetMemberFromSlash(interaction);
        const durationRaw = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const durationMs = parseDuration(durationRaw);
        const result = await restrictions.restrictMember(db, interaction.guild, member, interaction.user, {
          reason,
          durationMs,
          source: 'command'
        });
        await restrictions.sendRestrictLog(db, interaction.guild, member, interaction.user, result.caseId, reason, 'command', null);
        await reply(interaction, {
          embeds: [
            success(
              db,
              interaction.guild.id,
              `${member} restricted. Case #${result.caseId}. Duration: ${formatDuration(durationMs)}.`
            )
          ]
        });
        break;
      }

      case 'unrestrict': {
        requireRestrict(db, interaction.member);
        const member = getTargetMemberFromSlash(interaction);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const result = await restrictions.unrestrictMember(db, interaction.guild, member, interaction.user, reason);
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} unrestricted. Case #${result.caseId}.`)] });
        break;
      }

      case 'ban':
      case 'unban':
      case 'kick':
      case 'mute':
      case 'unmute':
      case 'warn':
      case 'unwarn':
      case 'warnings':
      case 'softban':
      case 'mass-ban':
      case 'ban-list': {
        await handleModerationSlash(interaction, db, client);
        break;
      }

      case 'afk': {
        const reason = interaction.options.getString('reason') || 'AFK';
        db.setAfk(interaction.guild.id, interaction.user.id, reason);
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `You are now AFK: ${reason}`)] }, true);
        break;
      }

      case 'poll': {
        const question = interaction.options.getString('question');
        const opts = interaction.options.getString('options').split('|').map((item) => item.trim()).filter(Boolean).slice(0, 9);
        if (opts.length < 2) throw new Error('Please provide at least 2 options separated by |.');
        const message = await interaction.channel.send({
          embeds: [
            buildEmbed(db, interaction.guild.id, {
              title: question,
              description: opts.map((item, index) => `${index + 1}. ${item}`).join('\n'),
              style: 'violet'
            })
          ]
        });
        const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
        for (let i = 0; i < opts.length; i += 1) await message.react(reactions[i]).catch(() => null);
        await reply(interaction, { embeds: [success(db, interaction.guild.id, 'Poll created.')] }, true);
        break;
      }

      case 'steal-emoji': {
        requireModerator(db, interaction.member);
        const source = interaction.options.getString('source');
        const nameArg = interaction.options.getString('name');
        const match = source.match(/<a?:\w+:(\d+)>/);
        const url = match
          ? `https://cdn.discordapp.com/emojis/${match[1]}.${source.startsWith('<a:') ? 'gif' : 'png'}`
          : source;
        const emoji = await interaction.guild.emojis.create({ attachment: url, name: nameArg });
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `Emoji created: ${emoji}`)] });
        break;
      }

      case 'steal-sticker': {
        requireModerator(db, interaction.member);
        const url = interaction.options.getString('url');
        const stickerName = interaction.options.getString('name');
        const sticker = await interaction.guild.stickers.create({
          file: url,
          name: stickerName,
          tags: 'sticker',
          description: `Created by ${interaction.user.tag}`
        });
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `Sticker created: ${sticker.name}`)] });
        break;
      }

      case 'dm': {
        requireModerator(db, interaction.member);
        const user = interaction.options.getUser('user');
        const message = interaction.options.getString('message');
        await user.send(message);
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `DM sent to ${user}.`)] }, true);
        break;
      }

      case 'say': {
        requireModerator(db, interaction.member);
        const message = interaction.options.getString('message');
        await interaction.channel.send(message);
        await reply(interaction, { embeds: [success(db, interaction.guild.id, 'Message sent.')] }, true);
        break;
      }

      case 'help': {
        await reply(interaction, helpPayload(db, interaction.guild.id), true);
        break;
      }

      case 'ping': {
        await reply(interaction, { embeds: [success(db, interaction.guild.id, `Pong. WebSocket: ${Math.round(client.ws.ping)}ms.`)] }, true);
        break;
      }

      case 'lock':
      case 'unlock':
      case 'lockdown':
      case 'unlockdown':
      case 'purge':
      case 'note':
      case 'slowmode':
      case 'give-role':
      case 'remove-role':
      case 'userinfo':
      case 'voice-mute':
      case 'lock-user':
      case 'unlock-user':
      case 'temp-role':
      case 'temp-role-remove':
      case 'temp-role-list':
      case 'snipe':
      case 'set-nick':
      case 'remind':
      case 'giveaway':
      case 'move':
      case 'first-message':
      case 'case': {
        await handleUtilitySlash(interaction, db, client);
        break;
      }

      case 'embed-create': {
        assertAiFeaturesAvailable(db);
        await interaction.deferReply();
        try {
          const generated = await createEmbedFromAI(interaction.options.getString('description'));
          await interaction.editReply({
            embeds: [buildEmbed(db, interaction.guild.id, embedOptionsFromAI(generated))]
          });
        } catch (err) {
          await interaction.editReply({
            embeds: [error(db, interaction.guild.id, err.message || 'AI embed creation failed.')]
          });
        }
        break;
      }

      case 'booster-role': {
        await handleBoosterRole(interaction, db);
        break;
      }

      case 'game': {
        await games.runSimpleGame(db, interaction, interaction.options.getString('name'), interaction.options.getUser('opponent'));
        break;
      }

      case 'balance':
      case 'daily':
      case 'profile':
      case 'level':
      case 'leaderboard': {
        await handleProgressionSlash(interaction, db);
        break;
      }

      case 'role-level': {
        await handleRoleLevelSlash(interaction, db);
        break;
      }

      case 'verification':
      case 'channel-restriction':
      case 'mass-sync-categories':
      case 'bump':
      case 'pet':
      case 'qna':
      case 'invite-role':
      case 'role-invites':
      case 'invites': {
        await handleCommunitySlash(interaction, db);
        break;
      }

      default:
        await reply(interaction, { embeds: [error(db, interaction.guild.id, 'Unknown command.')] }, true);
    }
  } catch (err) {
    await reply(interaction, { embeds: [error(db, interaction.guild?.id, err.message || 'Command failed.')] }, true).catch(() => null);
  }
}

async function handleModerationSlash(interaction, db, client) {
  requireModerator(db, interaction.member);
  const name = interaction.commandName;

  if (name === 'ban') {
    const user = interaction.options.getUser('user');
    assertNotProtectedOwner(user.id);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.guild.members.ban(user.id, { reason });
    const caseId = db.createCase(interaction.guild.id, 'BAN', user.id, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Ban', user, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${user} banned. Case #${caseId}.`)] });
    return;
  }

  if (name === 'unban') {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.guild.members.unban(userId, reason);
    const caseId = db.createCase(interaction.guild.id, 'UNBAN', userId, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Unban', { id: userId, toString: () => userId }, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${userId} unbanned. Case #${caseId}.`)] });
    return;
  }

  if (name === 'kick') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await member.kick(reason);
    const caseId = db.createCase(interaction.guild.id, 'KICK', member.id, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Kick', member.user, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member.user} kicked. Case #${caseId}.`)] });
    return;
  }

  if (name === 'mute') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const duration = parseDuration(interaction.options.getString('duration'));
    if (!duration) throw new Error('Please provide a valid duration like 10m, 1h, 7d.');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await member.timeout(Math.min(duration, 28 * 24 * 60 * 60 * 1000), reason);
    const caseId = db.createCase(interaction.guild.id, 'MUTE', member.id, interaction.user.id, reason, { duration });
    await moderationLog(db, interaction.guild, caseId, 'Mute', member.user, interaction.user, reason, [
      { name: 'Duration', value: formatDuration(duration), inline: true }
    ]);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} muted for ${formatDuration(duration)}. Case #${caseId}.`)] });
    return;
  }

  if (name === 'unmute') {
    const member = getTargetMemberFromSlash(interaction);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await member.timeout(null, reason);
    const caseId = db.createCase(interaction.guild.id, 'UNMUTE', member.id, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Unmute', member.user, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} unmuted. Case #${caseId}.`)] });
    return;
  }

  if (name === 'warn') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const reason = interaction.options.getString('reason');
    const caseId = db.createCase(interaction.guild.id, 'WARN', member.id, interaction.user.id, reason);
    db.addWarning(interaction.guild.id, member.id, interaction.user.id, reason, caseId);
    await moderationLog(db, interaction.guild, caseId, 'Warn', member.user, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} warned. Case #${caseId}.`)] });
    return;
  }

  if (name === 'unwarn') {
    const caseId = interaction.options.getInteger('case_id');
    db.removeWarning(interaction.guild.id, caseId);
    db.updateCase(interaction.guild.id, caseId, { type: 'UNWARNED' });
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Warning case #${caseId} removed.`)] });
    return;
  }

  if (name === 'warnings') {
    const member = getTargetMemberFromSlash(interaction);
    const warnings = db.listWarnings(interaction.guild.id, member.id);
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: `Warnings for ${member.user.tag}`,
          description: warnings.length
            ? warnings.map((entry) => `#${entry.case_id}: ${entry.reason || 'No reason'}`).join('\n')
            : 'No active warnings.',
          style: 'amber'
        })
      ]
    }, true);
    return;
  }

  if (name === 'softban') {
    const user = interaction.options.getUser('user');
    assertNotProtectedOwner(user.id);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
    await interaction.guild.members.unban(user.id, 'Softban complete');
    const caseId = db.createCase(interaction.guild.id, 'SOFTBAN', user.id, interaction.user.id, reason);
    await moderationLog(db, interaction.guild, caseId, 'Softban', user, interaction.user, reason);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${user} softbanned. Case #${caseId}.`)] });
    return;
  }

  if (name === 'mass-ban') {
    const ids = interaction.options.getString('user_ids').split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
    const protectedIds = ids.filter((id) => isBotOwner(id));
    const targetIds = ids.filter((id) => !isBotOwner(id));
    const reason = interaction.options.getString('reason') || 'Mass ban';
    const banned = [];
    for (const id of targetIds) {
      await interaction.guild.members.ban(id, { reason }).then(() => banned.push(id)).catch(() => null);
    }
    const caseId = db.createCase(interaction.guild.id, 'MASSBAN', banned.join(','), interaction.user.id, reason, { banned });
    await moderationLog(db, interaction.guild, caseId, 'Mass Ban', { id: banned.join(','), toString: () => `${banned.length} users` }, interaction.user, reason);
    const skipped = protectedIds.length ? ` Skipped ${protectedIds.length} protected owner ID(s).` : '';
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Banned ${banned.length}/${ids.length} users. Case #${caseId}.${skipped}`)] });
    return;
  }

  if (name === 'ban-list') {
    const bans = await interaction.guild.bans.fetch();
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Ban List',
          description: bans.size
            ? bans.first(25).map((ban) => `${ban.user.tag} (${ban.user.id})`).join('\n')
            : 'No bans found.',
          style: 'ruby'
        })
      ]
    }, true);
  }
}

async function handleUtilitySlash(interaction, db, client) {
  const name = interaction.commandName;

  if (!['userinfo', 'snipe', 'first-message'].includes(name)) {
    requireModerator(db, interaction.member);
  }

  if (name === 'lock' || name === 'unlock') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const deny = name === 'lock' ? false : null;
    await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: deny });
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${channel} ${name === 'lock' ? 'locked' : 'unlocked'}.`)] });
    return;
  }

  if (name === 'lockdown' || name === 'unlockdown') {
    const deny = name === 'lockdown' ? false : null;
    let count = 0;
    for (const channel of interaction.guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: deny }).then(() => { count += 1; }).catch(() => null);
      }
    }
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${name === 'lockdown' ? 'Locked' : 'Unlocked'} ${count} text channels.`)] });
    return;
  }

  if (name === 'purge') {
    const amount = interaction.options.getInteger('amount');
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Deleted ${deleted.size} messages.`)] }, true);
    return;
  }

  if (name === 'note') {
    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');
    if (action === 'add') {
      assertNotProtectedOwner(user.id);
      const note = interaction.options.getString('note');
      if (!note) throw new Error('Note text is required.');
      db.addNote(interaction.guild.id, user.id, interaction.user.id, note);
      await reply(interaction, { embeds: [success(db, interaction.guild.id, `Note added for ${user}.`)] }, true);
      return;
    }
    const notes = db.listNotes(interaction.guild.id, user.id);
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: `Notes for ${user.tag}`,
          description: notes.length ? notes.map((entry) => `<t:${Math.floor(entry.created_at / 1000)}:d> ${entry.note}`).join('\n') : 'No notes.',
          style: 'royal'
        })
      ]
    }, true);
    return;
  }

  if (name === 'slowmode') {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.setRateLimitPerUser(seconds);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Slowmode set to ${seconds}s in ${channel}.`)] });
    return;
  }

  if (name === 'give-role' || name === 'remove-role') {
    const member = getTargetMemberFromSlash(interaction);
    const role = interaction.options.getRole('role');
    if (name === 'remove-role') assertNotProtectedOwner(member.id);
    if (name === 'give-role') await member.roles.add(role);
    else await member.roles.remove(role);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${name === 'give-role' ? 'Gave' : 'Removed'} ${role} ${name === 'give-role' ? 'to' : 'from'} ${member}.`)] });
    return;
  }

  if (name === 'userinfo') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: `User Info - ${user.tag}`,
          thumbnail: user.displayAvatarURL(),
          fields: [
            { name: 'ID', value: user.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
            { name: 'Joined', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Not in server', inline: true },
            { name: 'Roles', value: member ? `${member.roles.cache.size - 1}` : '0', inline: true }
          ],
          style: 'sapphire'
        })
      ]
    }, true);
    return;
  }

  if (name === 'voice-mute') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const muted = interaction.options.getBoolean('muted');
    if (!member.voice.channel) throw new Error('That member is not in a voice channel.');
    await member.voice.setMute(muted);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} voice mute: ${muted}.`)] });
    return;
  }

  if (name === 'lock-user' || name === 'unlock-user') {
    const member = getTargetMemberFromSlash(interaction);
    if (name === 'lock-user') assertNotProtectedOwner(member.id);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.permissionOverwrites.edit(member.id, { SendMessages: name === 'lock-user' ? false : null });
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} ${name === 'lock-user' ? 'locked from' : 'unlocked in'} ${channel}.`)] });
    return;
  }

  if (name === 'temp-role') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const role = interaction.options.getRole('role');
    const duration = parseDuration(interaction.options.getString('duration'));
    if (!duration) throw new Error('Please provide a valid duration.');
    const reason = interaction.options.getString('reason') || 'Temporary role';
    await member.roles.add(role, reason);
    db.addTempRole(interaction.guild.id, member.id, role.id, interaction.user.id, reason, Date.now() + duration);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${role} given to ${member} for ${formatDuration(duration)}.`)] });
    return;
  }

  if (name === 'temp-role-remove') {
    const member = getTargetMemberFromSlash(interaction);
    const role = interaction.options.getRole('role');
    await member.roles.remove(role, 'Temporary role removed');
    db.removeTempRole(interaction.guild.id, member.id, role.id);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${role} removed from ${member}.`)] });
    return;
  }

  if (name === 'temp-role-list') {
    const user = interaction.options.getUser('user');
    const rows = db.listTempRoles(interaction.guild.id, user?.id);
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Temporary Roles',
          description: rows.length
            ? rows.map((row) => `<@${row.user_id}> <@&${row.role_id}> expires <t:${Math.floor(row.expires_at / 1000)}:R>`).join('\n')
            : 'No temporary roles.',
          style: 'ocean'
        })
      ]
    }, true);
    return;
  }

  if (name === 'snipe') {
    const snipe = db.getSnipe(interaction.guild.id, interaction.channel.id);
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Snipe',
          description: snipe ? `${snipe.content || 'No text'}\n${snipe.attachment_url || ''}` : 'No deleted message stored.',
          fields: snipe ? [{ name: 'Author', value: `<@${snipe.author_id}>`, inline: true }] : [],
          style: 'mono'
        })
      ]
    }, true);
    return;
  }

  if (name === 'set-nick') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const nickname = interaction.options.getString('nickname');
    await member.setNickname(nickname);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Nickname updated for ${member}.`)] });
    return;
  }

  if (name === 'remind') {
    const duration = parseDuration(interaction.options.getString('duration'));
    if (!duration) throw new Error('Please provide a valid duration.');
    const message = interaction.options.getString('message');
    db.addReminder(interaction.guild.id, interaction.user.id, interaction.channel.id, message, Date.now() + duration);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Reminder set for ${formatDuration(duration)}.`)] }, true);
    return;
  }

  if (name === 'giveaway') {
    await handleGiveawaySlash(interaction, db);
    return;
  }

  if (name === 'move') {
    const member = getTargetMemberFromSlash(interaction);
    assertNotProtectedOwner(member.id);
    const channel = interaction.options.getChannel('channel');
    await member.voice.setChannel(channel);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `${member} moved to ${channel}.`)] });
    return;
  }

  if (name === 'first-message') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const messages = await channel.messages.fetch({ limit: 1, after: '0' });
    const first = messages.first();
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'First Message',
          description: first ? `[Jump to message](${first.url})\n${first.content || 'No text'}` : 'No message found.',
          style: 'mono'
        })
      ]
    }, true);
    return;
  }

  if (name === 'case') {
    await handleCaseSlash(interaction, db);
  }
}

async function handleGiveawaySlash(interaction, db) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'create') {
    const duration = parseDuration(interaction.options.getString('duration'));
    if (!duration) throw new Error('Please provide a valid duration.');
    const prize = interaction.options.getString('prize');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const giveawayId = `${Date.now()}`;
    const message = await interaction.channel.send({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Giveaway',
          description: `Prize: **${prize}**\nWinners: **${winnerCount}**\nEnds: <t:${Math.floor((Date.now() + duration) / 1000)}:R>\nReact with 🎉 to enter.`,
          style: 'rose'
        })
      ]
    });
    await message.react('🎉').catch(() => null);
    db.createGiveaway(interaction.guild.id, {
      giveawayId,
      channelId: interaction.channel.id,
      messageId: message.id,
      prize,
      winnerCount,
      endsAt: Date.now() + duration,
      createdBy: interaction.user.id
    });
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Giveaway created. ID: \`${giveawayId}\`.`)] }, true);
    return;
  }

  const giveawayId = interaction.options.getString('giveaway_id');
  const giveaway = db.getGiveaway(interaction.guild.id, giveawayId);
  if (!giveaway) throw new Error('Giveaway not found.');
  const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
  const message = giveaway.message_id ? await channel.messages.fetch(giveaway.message_id).catch(() => null) : null;
  const reaction = message?.reactions.cache.get('🎉');
  const users = reaction ? (await reaction.users.fetch()).filter((user) => !user.bot).map((user) => user) : [];
  const winners = users.sort(() => Math.random() - 0.5).slice(0, giveaway.winner_count);
  await reply(interaction, {
    embeds: [
      success(
        db,
        interaction.guild.id,
        winners.length ? `Rerolled winners for **${giveaway.prize}**: ${winners.join(', ')}` : 'No eligible users reacted.'
      )
    ]
  });
}

async function handleCaseSlash(interaction, db) {
  requireModerator(db, interaction.member);
  const sub = interaction.options.getSubcommand();
  const caseId = interaction.options.getInteger('case_id');
  if (sub === 'delete') {
    db.deleteCase(interaction.guild.id, caseId);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Case #${caseId} deleted.`)] }, true);
    return;
  }
  if (sub === 'change') {
    const reason = interaction.options.getString('reason');
    const updated = db.updateCase(interaction.guild.id, caseId, { reason });
    if (!updated) throw new Error('Case not found.');
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Case #${caseId} updated.`)] }, true);
    return;
  }
  const entry = db.getCase(interaction.guild.id, caseId);
  if (!entry) throw new Error('Case not found.');
  await reply(interaction, {
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: `Case #${entry.case_id}`,
        fields: [
          { name: 'Type', value: entry.type, inline: true },
          { name: 'Target', value: entry.target_id ? `<@${entry.target_id}> (${entry.target_id})` : 'None', inline: true },
          { name: 'Moderator', value: entry.moderator_id ? `<@${entry.moderator_id}>` : 'System', inline: true },
          { name: 'Reason', value: entry.reason || 'No reason' }
        ],
        style: 'royal'
      })
    ]
  }, true);
}

async function handleBoosterRole(interaction, db) {
  const member = interaction.member;
  if (!member.premiumSince && !member.roles.premiumSubscriberRole) {
    throw new Error('Only server boosters can create a booster role.');
  }

  const name = interaction.options.getString('name');
  const color = colorFromInput(interaction.options.getString('color')) || 0x5865f2;
  const imageUrl = interaction.options.getString('image_url');
  const existing = db.getBoosterRole(interaction.guild.id, member.id);
  let role = existing ? await interaction.guild.roles.fetch(existing.role_id).catch(() => null) : null;

  const data = { name, color, reason: `Booster role for ${member.user.tag}` };
  if (!role) {
    role = await interaction.guild.roles.create(data);
    db.setBoosterRole(interaction.guild.id, member.id, role.id);
    await member.roles.add(role).catch(() => null);
  } else {
    await role.edit(data);
  }

  if (imageUrl && role.setIcon) {
    const response = await fetch(imageUrl).catch(() => null);
    if (response?.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      await role.setIcon(buffer).catch(() => null);
    }
  }

  const botTop = interaction.guild.members.me.roles.highest.position;
  const targetPosition = Math.min(member.roles.highest.position + 1, botTop - 1);
  if (targetPosition > 0) await role.setPosition(targetPosition).catch(() => null);

  await reply(interaction, { embeds: [success(db, interaction.guild.id, `Booster role ready: ${role}.`)] }, true);
}

async function handleProgressionSlash(interaction, db) {
  const name = interaction.commandName;

  if (name === 'daily') {
    const result = progression.claimDaily(db, interaction.guild.id, interaction.user.id);
    if (!result.claimed) {
      await reply(interaction, {
        embeds: [
          buildEmbed(db, interaction.guild.id, {
            title: 'Daily Reward',
            description: `You already claimed daily. Try again <t:${Math.floor(result.nextAt / 1000)}:R>.`,
            style: 'amber'
          })
        ]
      }, true);
      return;
    }

    await reply(interaction, {
      embeds: [
        success(
          db,
          interaction.guild.id,
          `You claimed **${result.reward} coins**. Streak: **${result.streak}**.\nBalance: **${result.progress.balance} coins**.`
        )
      ]
    }, true);
    return;
  }

  if (name === 'leaderboard') {
    const type = interaction.options.getString('type') || 'xp';
    const rows = db.listProgressLeaderboard(interaction.guild.id, type, 10);
    await reply(interaction, { embeds: [progression.leaderboardEmbed(db, interaction.guild, rows, type)] });
    return;
  }

  const user = interaction.options.getUser('user') || interaction.user;
  const progress = db.ensureMemberProgress(interaction.guild.id, user.id);
  const achievements = db.listAchievements(interaction.guild.id, user.id);

  if (name === 'balance') {
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Balance',
          description: `${user} has **${progress.balance || 0} coins**.`,
          style: 'amber'
        })
      ]
    });
    return;
  }

  if (name === 'level') {
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Level',
          description: `${user} is **level ${progress.level || 1}** with **${progress.xp || 0} XP**.`,
          style: 'royal'
        })
      ]
    });
    return;
  }

  await reply(interaction, { embeds: [progression.profileEmbed(db, interaction.guild, user, progress, achievements)] });
}

async function handleRoleLevelSlash(interaction, db) {
  requireModerator(db, interaction.member);
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const level = interaction.options.getInteger('level');
    const role = interaction.options.getRole('role');
    progression.addRoleReward(db, interaction.guild.id, level, role.id);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Level ${level} now rewards ${role}.`)] }, true);
    return;
  }

  if (sub === 'remove') {
    const level = interaction.options.getInteger('level');
    progression.removeRoleReward(db, interaction.guild.id, level);
    await reply(interaction, { embeds: [success(db, interaction.guild.id, `Removed role reward for level ${level}.`)] }, true);
    return;
  }

  const rewards = progression.listRoleRewards(db, interaction.guild.id);
  await reply(interaction, {
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: 'Role Level Rewards',
        description: rewards.length
          ? rewards.map((reward) => `Level **${reward.level}** -> <@&${reward.roleId}>`).join('\n')
          : 'No role-level rewards configured.',
        style: 'ocean'
      })
    ]
  }, true);
}

function colorFromInput(input) {
  if (!input) return null;
  const value = String(input).trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  if (/^0x[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(2), 16);
  return null;
}

function embedOptionsFromAI(generated) {
  return {
    title: generated.title || 'AI Embed',
    description: generated.description || 'No description.',
    fields: generated.fields || [],
    image: generated.image || null,
    thumbnail: generated.thumbnail || null,
    color: colorFromInput(generated.color),
    style: 'violet'
  };
}

function channelIdsFromText(text) {
  return String(text || '')
    .split(/[,\s]+/)
    .map(idFromMention)
    .filter(Boolean);
}

function validateInviteRole(guild, role) {
  if (!role || role.id === guild.id) throw new Error('Choose a real role for this invite.');
  if (role.managed) throw new Error('Managed roles can not be assigned by invite.');
  if (role.editable === false) {
    throw new Error('Move the bot role above that role before using it for invite roles.');
  }
}

function inviteRoleStatusEmbed(db, guild, title = 'Invite Roles') {
  const mappings = inviteRoles.listInviteRoleMappings(db, guild.id);
  return buildEmbed(db, guild.id, {
    title,
    description: inviteRoles.formatInviteRoleMappings(guild, mappings),
    fields: [
      {
        name: 'Requirement',
        value: 'The bot needs **Manage Server** permission so it can read invite usage.'
      }
    ],
    style: 'emerald'
  });
}

function inviteCountRoleStatusEmbed(db, guild, title = 'Invite Count Roles') {
  const rewards = inviteRoles.listInviteCountRoleRewards(db, guild.id);
  return buildEmbed(db, guild.id, {
    title,
    description: inviteRoles.formatInviteCountRoleRewards(guild, rewards),
    fields: [
      {
        name: 'Requirement',
        value: 'The bot needs **Manage Server** permission so it can track invite usage, and **Manage Roles** permission to give rewards.'
      }
    ],
    style: 'emerald'
  });
}

async function inviteUsageForUser(guild, userId) {
  const me = guild.members.me;
  if (me?.permissions && !me.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return { available: false, total: 0, codes: [] };
  }
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return { available: false, total: 0, codes: [] };

  const codes = [...invites.values()]
    .filter((invite) => invite.inviter?.id === userId)
    .map((invite) => ({
      code: invite.code,
      uses: Number(invite.uses || 0)
    }))
    .sort((a, b) => b.uses - a.uses || a.code.localeCompare(b.code));

  return {
    available: true,
    total: codes.reduce((sum, item) => sum + item.uses, 0),
    codes
  };
}

async function inviteStatsEmbed(db, guild, targetUser) {
  const tracked = db.inviteStats(guild.id, targetUser.id, 10);
  const current = await inviteUsageForUser(guild, targetUser.id);
  const activeTracked = tracked.recent.filter((row) => guild.members.cache.has(row.member_id)).length;
  const codeLines = tracked.codes.length
    ? tracked.codes.slice(0, 8).map((row) => `\`${row.invite_code || 'unknown'}\`: ${row.count}`).join('\n')
    : 'No tracked invite joins yet.';
  const currentLines = current.available
    ? (current.codes.length
        ? current.codes.slice(0, 8).map((row) => `\`${row.code}\`: ${row.uses}`).join('\n')
        : 'No active invite links owned by this member.')
    : 'Unavailable. The bot needs Manage Server permission to read invite uses.';
  const recentLines = tracked.recent.length
    ? tracked.recent.slice(0, 6).map((row) => `<@${row.member_id}> via \`${row.invite_code || 'unknown'}\` <t:${Math.floor(row.joined_at / 1000)}:R>`).join('\n')
    : 'No tracked joins yet.';

  return buildEmbed(db, guild.id, {
    title: `Invites - ${targetUser.tag || targetUser.username || targetUser.id}`,
    description: [
      `Tracked joins: **${tracked.total}**`,
      `Recent tracked members still cached: **${activeTracked}/${tracked.recent.length}**`,
      current.available ? `Current active invite uses: **${current.total}**` : 'Current active invite uses: **Unavailable**'
    ].join('\n'),
    fields: [
      { name: 'Tracked by code', value: codeLines },
      { name: 'Current active links', value: currentLines },
      { name: 'Recent tracked joins', value: recentLines }
    ],
    style: 'ocean'
  });
}

async function handleInvitesSlash(interaction, db) {
  const action = interaction.options.getString('action') || 'check';
  const resetAll = Boolean(interaction.options.getBoolean('all'));
  const targetUser = interaction.options.getUser('user') || interaction.user;

  if (action === 'reset') {
    requireModerator(db, interaction.member);
    const deleted = resetAll
      ? db.resetInviteStats(interaction.guild.id)
      : db.resetInviteStats(interaction.guild.id, targetUser.id);
    await reply(interaction, {
      embeds: [
        success(
          db,
          interaction.guild.id,
          resetAll
            ? `Reset all tracked invite stats. Removed ${deleted} tracked join${deleted === 1 ? '' : 's'}.`
            : `Reset tracked invite stats for ${targetUser}. Removed ${deleted} tracked join${deleted === 1 ? '' : 's'}.`
        )
      ]
    }, true);
    return;
  }

  if (targetUser.id !== interaction.user.id) requireModerator(db, interaction.member);
  await reply(interaction, {
    embeds: [await inviteStatsEmbed(db, interaction.guild, targetUser)]
  }, true);
}

async function handleInvitesPrefix(message, db, client, args) {
  const action = String(args[0] || 'check').toLowerCase();
  if (['reset', 'clear'].includes(action)) {
    requireModerator(db, message.member);
    args.shift();
    const targetRaw = args[0];
    if (String(targetRaw || '').toLowerCase() === 'all') {
      const deleted = db.resetInviteStats(message.guild.id);
      await message.reply({
        embeds: [success(db, message.guild.id, `Reset all tracked invite stats. Removed ${deleted} tracked join${deleted === 1 ? '' : 's'}.`)]
      });
      return;
    }
    const targetUser = targetRaw
      ? await resolveUser(client, message.guild, targetRaw)
      : message.author;
    if (!targetUser) throw new Error('User not found.');
    const deleted = db.resetInviteStats(message.guild.id, targetUser.id);
    await message.reply({
      embeds: [success(db, message.guild.id, `Reset tracked invite stats for ${targetUser}. Removed ${deleted} tracked join${deleted === 1 ? '' : 's'}.`)]
    });
    return;
  }

  const targetRaw = action === 'check' ? args[1] : args[0];
  const targetUser = targetRaw
    ? await resolveUser(client, message.guild, targetRaw)
    : message.author;
  if (!targetUser) throw new Error('User not found.');
  if (targetUser.id !== message.author.id) requireModerator(db, message.member);
  await message.reply({
    embeds: [await inviteStatsEmbed(db, message.guild, targetUser)]
  });
}

async function handleInviteRoleSlash(interaction, db) {
  requireModerator(db, interaction.member);
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const invite = interaction.options.getString('invite');
    const role = interaction.options.getRole('role');
    validateInviteRole(interaction.guild, role);
    const result = inviteRoles.setInviteRoleMapping(db, interaction.guild.id, invite, role.id);
    await reply(interaction, {
      embeds: [
        success(
          db,
          interaction.guild.id,
          `${result.replaced ? 'Updated' : 'Added'} invite \`${result.mapping.code}\` -> ${role}.`
        )
      ]
    }, true);
    return;
  }

  if (sub === 'remove') {
    const invite = interaction.options.getString('invite');
    const result = inviteRoles.removeInviteRoleMapping(db, interaction.guild.id, invite);
    await reply(interaction, {
      embeds: [
        result.removed
          ? success(db, interaction.guild.id, `Removed invite role mapping for \`${result.code}\`.`)
          : buildEmbed(db, interaction.guild.id, {
              title: 'Invite Role',
              description: `No mapping was found for \`${result.code}\`.`,
              style: 'amber'
            })
      ]
    }, true);
    return;
  }

  await reply(interaction, { embeds: [inviteRoleStatusEmbed(db, interaction.guild)] }, true);
}

async function handleInviteRolePrefix(message, db, args) {
  requireModerator(db, message.member);
  const sub = String(args.shift() || 'list').toLowerCase();

  if (sub === 'add' || sub === 'set') {
    const invite = args.shift();
    const roleId = idFromMention(args.shift());
    const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
    validateInviteRole(message.guild, role);
    const result = inviteRoles.setInviteRoleMapping(db, message.guild.id, invite, role.id);
    await message.reply({
      embeds: [
        success(
          db,
          message.guild.id,
          `${result.replaced ? 'Updated' : 'Added'} invite \`${result.mapping.code}\` -> ${role}.`
        )
      ]
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const result = inviteRoles.removeInviteRoleMapping(db, message.guild.id, args.shift());
    await message.reply({
      embeds: [
        result.removed
          ? success(db, message.guild.id, `Removed invite role mapping for \`${result.code}\`.`)
          : buildEmbed(db, message.guild.id, {
              title: 'Invite Role',
              description: `No mapping was found for \`${result.code}\`.`,
              style: 'amber'
            })
      ]
    });
    return;
  }

  if (sub !== 'list' && sub !== 'status') {
    throw new Error('Usage: r!invite-role add discord.gg/code @role, r!invite-role remove code, or r!invite-role list');
  }

  await message.reply({ embeds: [inviteRoleStatusEmbed(db, message.guild)] });
}

async function handleRoleInvitesSlash(interaction, db) {
  requireAdmin(db, interaction.member);
  const invites = interaction.options.getInteger('invites');
  const role = interaction.options.getRole('role');
  validateInviteRole(interaction.guild, role);
  const result = inviteRoles.setInviteCountRoleReward(db, interaction.guild.id, invites, role.id);
  await reply(interaction, {
    embeds: [
      success(
        db,
        interaction.guild.id,
        `${result.replaced ? 'Updated' : 'Added'} invite-count reward: **${result.reward.invites}** invite${result.reward.invites === 1 ? '' : 's'} -> ${role}.`
      )
    ]
  }, true);
}

async function handleRoleInvitesPrefix(message, db, args) {
  requireAdmin(db, message.member);
  const sub = String(args[0] || 'list').toLowerCase();

  if (sub === 'list' || sub === 'status') {
    await message.reply({ embeds: [inviteCountRoleStatusEmbed(db, message.guild)] });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    args.shift();
    const result = inviteRoles.removeInviteCountRoleReward(db, message.guild.id, args.shift());
    await message.reply({
      embeds: [
        result.removed
          ? success(db, message.guild.id, `Removed invite-count role reward for **${result.invites}** invite${result.invites === 1 ? '' : 's'}.`)
          : buildEmbed(db, message.guild.id, {
              title: 'Invite Count Roles',
              description: `No reward was found for **${result.invites}** invite${result.invites === 1 ? '' : 's'}.`,
              style: 'amber'
            })
      ]
    });
    return;
  }

  if (sub === 'add' || sub === 'set') args.shift();
  const invites = Number(args.shift());
  const roleId = idFromMention(args.shift());
  const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
  if (!Number.isFinite(invites) || invites < 1 || !role) {
    throw new Error('Usage: r!role-invites 5 @Role, r!role-invites remove 5, or r!role-invites list');
  }

  validateInviteRole(message.guild, role);
  const result = inviteRoles.setInviteCountRoleReward(db, message.guild.id, invites, role.id);
  await message.reply({
    embeds: [
      success(
        db,
        message.guild.id,
        `${result.replaced ? 'Updated' : 'Added'} invite-count reward: **${result.reward.invites}** invite${result.reward.invites === 1 ? '' : 's'} -> ${role}.`
      )
    ]
  });
}

async function handleCommunitySlash(interaction, db) {
  const name = interaction.commandName;

  if (name === 'invites') {
    await handleInvitesSlash(interaction, db);
    return;
  }

  if (name === 'invite-role') {
    await handleInviteRoleSlash(interaction, db);
    return;
  }

  if (name === 'role-invites') {
    await handleRoleInvitesSlash(interaction, db);
    return;
  }

  if (name === 'verification') {
    requireModerator(db, interaction.member);
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      await community.sendVerificationPanel(db, interaction, {
        channel: interaction.options.getChannel('channel'),
        role: interaction.options.getRole('role'),
        message: interaction.options.getString('message')
      });
      await reply(interaction, { embeds: [success(db, interaction.guild.id, 'Verification panel posted and settings saved.')] }, true);
      return;
    }
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Verification',
          description: [
            `Channel: ${db.getConfig(interaction.guild.id, 'verification_channel') ? `<#${db.getConfig(interaction.guild.id, 'verification_channel')}>` : 'Not set'}`,
            `Role: ${db.getConfig(interaction.guild.id, 'verified_role') ? `<@&${db.getConfig(interaction.guild.id, 'verified_role')}>` : 'Not set'}`
          ].join('\n'),
          style: 'emerald'
        })
      ]
    }, true);
    return;
  }

  if (name === 'channel-restriction') {
    requireModerator(db, interaction.member);
    await interaction.deferReply({ ephemeral: true });
    const result = await community.applyChannelRestriction(db, interaction.guild, channelIdsFromText(interaction.options.getString('except')));
    await interaction.editReply({
      embeds: [success(db, interaction.guild.id, `Restriction visibility synced. Updated ${result.updated} channels, skipped ${result.skipped}. Exempt: ${result.exempt.length || 0}.`)]
    });
    return;
  }

  if (name === 'mass-sync-categories') {
    requireModerator(db, interaction.member);
    await interaction.deferReply({ ephemeral: true });
    const result = await community.massSyncCategoryPermissions(interaction.guild);
    await interaction.editReply({
      embeds: [success(db, interaction.guild.id, `Synced ${result.synced} channels with their categories. Skipped ${result.skipped}.`)]
    });
    return;
  }

  if (name === 'bump') {
    const result = await community.runBump(db, interaction.guild, interaction.channel, interaction.user);
    await reply(interaction, {
      embeds: [
        result.bumped
          ? success(db, interaction.guild.id, `Bumped. Next bump <t:${Math.floor(result.nextAt / 1000)}:R>.`)
          : buildEmbed(db, interaction.guild.id, {
              title: 'Bump Cooldown',
              description: `Next bump <t:${Math.floor(result.nextAt / 1000)}:R>.`,
              style: 'amber'
            })
      ]
    }, true);
    return;
  }

  if (name === 'pet') {
    const sub = interaction.options.getSubcommand();
    let pet;
    if (sub === 'adopt') {
      const result = community.adoptPet(db, interaction.guild.id, interaction.user.id, interaction.options.getString('name'));
      pet = result.pet;
      await reply(interaction, {
        embeds: [
          buildEmbed(db, interaction.guild.id, {
            title: result.adopted ? 'Pet Adopted' : 'Pet Already Adopted',
            description: community.petStatusText(pet),
            style: 'violet'
          })
        ]
      });
      return;
    }
    if (sub === 'feed') pet = community.feedPet(db, interaction.guild.id, interaction.user.id);
    else if (sub === 'play') pet = community.playPet(db, interaction.guild.id, interaction.user.id);
    else pet = community.petStatus(db, interaction.guild.id, interaction.user.id);
    if (!pet) throw new Error('Adopt a pet first with /pet adopt.');
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Digital Pet',
          description: community.petStatusText(pet),
          style: 'violet'
        })
      ]
    });
    return;
  }

  if (name === 'qna') {
    requireModerator(db, interaction.member);
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const personality = interaction.options.getString('personality');
      db.setConfig(interaction.guild.id, 'qna_channel', channel.id);
      db.setConfig(interaction.guild.id, 'qna_personality', personality.slice(0, 1000));
      await reply(interaction, { embeds: [success(db, interaction.guild.id, `Q&A channel set to ${channel}.`)] }, true);
      return;
    }
    await reply(interaction, {
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Q&A',
          description: [
            `Channel: ${db.getConfig(interaction.guild.id, 'qna_channel') ? `<#${db.getConfig(interaction.guild.id, 'qna_channel')}>` : 'Not set'}`,
            `Personality: ${db.getConfig(interaction.guild.id, 'qna_personality') || 'Not set'}`
          ].join('\n'),
          style: 'ocean'
        })
      ]
    }, true);
  }
}

const HELP_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    lines: [
      'Use the dropdown to browse command sections.',
      `Prefixes: \`${env.defaultPrefix}\`, owner prefix \`${env.ownerPrefix}\`, SWAT prefix \`${env.swatPrefix || 'swat'}\`.`,
      'Start with `/setup` or `r!setup` for server configuration.'
    ]
  },
  {
    id: 'moderation',
    label: 'Moderation',
    lines: [
      '`restrict`, `unrestrict`, `ban`, `kick`, `mute`, `unmute`, `warn`, `unwarn`, `warnings`',
      '`purge`, `slowmode`, `softban`, `mass-ban`, `ban-list`, `case`, `note`',
      '`channel-restriction`, `mass-sync-categories`, `lock`, `unlock`, `lockdown`, `unlockdown`'
    ]
  },
  {
    id: 'systems',
    label: 'Server Systems',
    lines: [
      '`verification setup #channel @role [message]`, `qna setup #channel personality`, `invite-role add invite @role`',
      '`role-invites 5 @Role`, `/role-invites invites:5 role:@Role`',
      '`invites [member]`, `invites reset [member|all]`, `sticky set message`, `sticky clear`, `bump`, `poll`, `giveaway`, `remind`, `afk`',
      '`setup` manages roles, channels, access, styles, messages, tickets, verification, bump, invite roles, and Q&A settings.'
    ]
  },
  {
    id: 'roles',
    label: 'Roles & Levels',
    lines: [
      '`give-role`, `remove-role`, `temp-role`, `temp-role-remove`, `temp-role-list`',
      '`booster-role`, `role-level`, `daily`, `balance`, `profile`, `level`, `leaderboard`'
    ]
  },
  {
    id: 'fun',
    label: 'Fun & Pet',
    lines: [
      '`game tictactoe/coinflip/dice/rps/8ball/slots/trivia/roulette/scramble`',
      '`pet adopt [name]`, `pet feed`, `pet play`, `pet status`',
      '`swat help` for case files, SWAT database, episode guessing, and season awards.'
    ]
  },
  {
    id: 'ai',
    label: 'AI & Embeds',
    lines: [
      'Mention the bot for AI, or configure Q&A with `qna setup`.',
      '`embed-create` builds an embed from a description.',
      'AI replies are sent with mentions disabled to prevent everyone/here/user/role pings.'
    ]
  },
  {
    id: 'owner',
    label: 'Owner',
    lines: [
      '`oc help`, `oc guilds`, `oc broadcast`, `oc serversettings`, `oc commandusage`, `oc riskreport`',
      '`oc ticket-panel create`, `oc ticket-panel update`, `oc ticket-panel mode`, `oc panic mode`, `oc panic ai`',
      '`oc lock`, `oc unlock`, `oc maintenance`, `oc db stats`, `oc db backup`',
      '`oc blacklist user|guild id [reason]`, `oc unblacklist user|guild id`, `oc audit`, `oc restoreuser`, `oc rolefix`'
    ]
  }
];

function helpSection(sectionId) {
  return HELP_SECTIONS.find((section) => section.id === sectionId) || HELP_SECTIONS[0];
}

function helpSectionRow(selected = 'overview') {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help:section')
      .setPlaceholder('Choose a help section')
      .addOptions(HELP_SECTIONS.map((section) => ({
        label: section.label,
        value: section.id,
        default: section.id === selected
      })))
  );
}

function helpEmbed(db, guildId, sectionId = 'overview') {
  const section = helpSection(sectionId);
  return buildEmbed(db, guildId, {
    title: `Help - ${section.label}`,
    description: section.lines.join('\n'),
    style: 'sapphire'
  });
}

function helpPayload(db, guildId, sectionId = 'overview') {
  return {
    embeds: [helpEmbed(db, guildId, sectionId)],
    components: [helpSectionRow(sectionId)]
  };
}

async function handleHelpInteraction(db, interaction) {
  const section = interaction.values?.[0] || 'overview';
  await interaction.update(helpPayload(db, interaction.guild?.id, section));
  return true;
}

async function handlePrefixMessage(message, db, client) {
  const content = message.content.trim();
  if (matchesPrefix(content, env.ownerPrefix)) {
    const raw = content.slice(env.ownerPrefix.length).trim();
    const [commandRaw, ...args] = splitArgs(raw);
    if (!commandRaw) return false;
    await handleOwnerPrefix(message, db, client, commandRaw.toLowerCase(), args);
    return true;
  }

  if (env.swatPrefix && matchesPrefix(content, env.swatPrefix)) {
    if (env.swatGuildId && message.guild?.id !== env.swatGuildId) return false;
    const raw = content.slice(env.swatPrefix.length).trim();
    await swat.handleSwatMessage(message, db, raw || 'help');
    return true;
  }

  if (!env.enablePrefixCommands || !matchesPrefix(content, env.defaultPrefix)) return false;
  const raw = content.slice(env.defaultPrefix.length).trim();
  const [commandRaw, ...args] = splitArgs(raw);
  if (!commandRaw) return false;
  const command = normalizeCommand(commandRaw);

  try {
    await handlePrefixCommand(message, db, client, command, args);
  } catch (err) {
    await message.reply({ embeds: [error(db, message.guild?.id, err.message || 'Command failed.')] }).catch(() => null);
  }
  return true;
}

function onOffValue(value, fallback = true) {
  const lowered = String(value || '').toLowerCase();
  if (['on', 'true', 'enable', 'enabled', 'yes', '1'].includes(lowered)) return true;
  if (['off', 'false', 'disable', 'disabled', 'no', '0'].includes(lowered)) return false;
  return fallback;
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ownerTargetGuild(client, message, args) {
  const maybeId = idFromMention(args[0]);
  const guild = maybeId ? client.guilds.cache.get(maybeId) : null;
  if (guild) {
    args.shift();
    return guild;
  }
  if (!message.guild) throw new Error('Guild ID is required.');
  return message.guild;
}

async function ownerTargetMember(client, message, args) {
  const guild = ownerTargetGuild(client, message, args);
  const userId = idFromMention(args.shift());
  if (!userId) throw new Error('User ID or mention is required.');
  const member = await guild.members.fetch(userId).catch(() => null);
  return { guild, userId, member };
}

function configSummary(config) {
  return Object.entries(config)
    .map(([key, value]) => {
      const rendered = Array.isArray(value)
        ? (value.length ? value.join(', ') : '[]')
        : value === null || value === undefined
          ? 'null'
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
      return `\`${key}\`: ${rendered}`;
    })
    .join('\n')
    .slice(0, 3900);
}

function findBroadcastChannel(db, guild) {
  const configuredIds = [
    db.getConfig(guild.id, 'advanced_logs_channel'),
    db.getConfig(guild.id, 'welcome_channel'),
    db.getConfig(guild.id, 'restrict_logs_channel')
  ].filter(Boolean);

  const candidates = [
    guild.systemChannel,
    ...configuredIds.map((id) => guild.channels.cache.get(id)),
    ...guild.channels.cache.values()
  ].filter(Boolean);

  return candidates.find((channel) => {
    if (!channel?.isTextBased?.()) return false;
    const permissions = channel.permissionsFor(guild.members.me);
    return permissions?.has(PermissionsBitField.Flags.SendMessages);
  }) || null;
}

async function sendBroadcast(db, client, target, text) {
  const guilds = target === 'all'
    ? [...client.guilds.cache.values()]
    : [client.guilds.cache.get(target)].filter(Boolean);
  if (!guilds.length) throw new Error('No matching guilds found.');

  let sent = 0;
  for (const guild of guilds) {
    const channel = findBroadcastChannel(db, guild);
    if (!channel) continue;
    await channel.send({
      embeds: [buildEmbed(db, guild.id, { title: 'Broadcast', description: text.slice(0, 3900), style: 'royal' })]
    }).then(() => { sent += 1; }).catch(() => null);
  }
  return { sent, total: guilds.length };
}

function parseKeyValueOptions(args) {
  const options = {};
  const rest = [];
  for (const arg of args) {
    const index = arg.indexOf('=');
    if (index > 0) {
      const key = arg.slice(0, index).toLowerCase().replace(/[-_]/g, '');
      options[key] = arg.slice(index + 1);
    } else {
      rest.push(arg);
    }
  }
  return { options, rest };
}

function optionValue(options, keys) {
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (options[normalized] !== undefined) return options[normalized];
  }
  return null;
}

function ticketPanelPatchFromOptions(options) {
  const patch = {};
  const map = [
    ['name', ['name', 'title']],
    ['description', ['description', 'desc']],
    ['mode', ['mode', 'system', 'type']],
    ['panelContent', ['text', 'content', 'panel', 'panelText', 'panelContent']],
    ['buttonLabel', ['button', 'buttonText', 'buttonLabel', 'openButton']],
    ['buttonStyle', ['style', 'buttonStyle']],
    ['buttonEmoji', ['emoji', 'buttonEmoji']],
    ['openMessage', ['open', 'openMessage', 'ticketMessage', 'welcome']],
    ['closeButtonLabel', ['close', 'closeButton', 'closeButtonLabel']],
    ['deleteButtonLabel', ['delete', 'deleteButton', 'deleteButtonLabel']]
  ];

  for (const [field, keys] of map) {
    const value = optionValue(options, keys);
    if (value !== null) patch[field] = value;
  }

  const categoryId = idFromMention(optionValue(options, ['category', 'categoryId']));
  if (categoryId) patch.categoryId = categoryId;
  const supportRoleId = idFromMention(optionValue(options, ['role', 'staff', 'supportRole', 'supportRoleId']));
  if (supportRoleId) patch.supportRoleId = supportRoleId;

  return patch;
}

function ticketPanelHelpText() {
  return [
    '`oc ticket-panel create channel=#channel mode=channel title="Support" description="Open a ticket" button="Open Ticket"`',
    '`oc ticket-panel create mode=thread title="Support" open_message="Hi {user}, staff will help in {ticket}"`',
    '`oc ticket-panel update panel-id button="Contact Staff" open_message="Welcome {user}"`',
    '`oc ticket-panel mode panel-id channel` or `oc ticket-panel mode panel-id thread`',
    'Keys: `channel`, `mode`, `title`, `description`, `text`, `category`, `role`, `button`, `style`, `emoji`, `open_message`, `close`, `delete`.'
  ].join('\n');
}

async function handleOwnerTicketPanel(message, db, client, args) {
  ensureGuild(message);
  const sub = String(args.shift() || 'help').toLowerCase();

  if (sub === 'help') {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Owner Ticket Panels', description: ticketPanelHelpText(), style: 'royal' })] });
    return;
  }

  if (sub === 'list') {
    const panels = db.listTicketPanels(message.guild.id);
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Ticket Panels',
          description: panels.length
            ? panels.map((panel) => `\`${panel.panel_id}\` - ${panel.name} - **${panel.mode || 'thread'}**`).join('\n')
            : 'No ticket panels saved for this server.',
          style: 'ocean'
        })
      ]
    });
    return;
  }

  if (sub === 'create' || sub === 'send') {
    const { options } = parseKeyValueOptions(args);
    const channelId = idFromMention(optionValue(options, ['channel', 'target'])) || message.channel.id;
    const channel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error('Ticket panel channel must be a text channel.');
    const patch = ticketPanelPatchFromOptions(options);
    await tickets.sendTicketPanel(db, {
      guild: message.guild,
      channel,
      user: message.author,
      reply: (payload) => message.reply(payload)
    }, patch);
    return;
  }

  if (sub === 'mode') {
    const panelId = String(args.shift() || '').trim();
    const mode = String(args.shift() || '').toLowerCase();
    if (!panelId || !['channel', 'thread'].includes(mode)) throw new Error('Usage: oc ticket-panel mode panel-id channel|thread');
    const result = await tickets.updateTicketPanel(db, message.guild, panelId, { mode });
    await message.reply({ embeds: [success(db, message.guild.id, `Ticket panel \`${result.panel.panelId}\` now uses **${result.panel.mode}** tickets.${result.edited ? ' Panel message updated.' : ''}`)] });
    return;
  }

  if (sub === 'update' || sub === 'edit') {
    const panelId = String(args.shift() || '').trim();
    if (!panelId) throw new Error('Usage: oc ticket-panel update panel-id key=value ...');
    const { options } = parseKeyValueOptions(args);
    const patch = ticketPanelPatchFromOptions(options);
    if (!Object.keys(patch).length) throw new Error('No updates provided. Use key=value options.');
    const result = await tickets.updateTicketPanel(db, message.guild, panelId, patch);
    await message.reply({ embeds: [success(db, message.guild.id, `Ticket panel \`${result.panel.panelId}\` updated.${result.edited ? ' Panel message edited.' : ''}`)] });
    return;
  }

  throw new Error(`Owner ticket command not found.\n${ticketPanelHelpText()}`);
}

function tableCountsText(stats) {
  return Object.entries(stats.tables)
    .map(([table, count]) => `\`${table}\`: ${count}`)
    .join('\n')
    .slice(0, 3900);
}

function usageText(rows) {
  return rows.length
    ? rows.map((row) => `\`${row.source}:${row.command_name}\` - ${row.count} uses - <t:${Math.floor(row.last_used_at / 1000)}:R>`).join('\n')
    : 'No command usage recorded yet.';
}

function botBansText(rows) {
  return rows.length
    ? rows.map((row) => `\`${row.kind}\` ${row.id} - ${row.reason || 'No reason'} - <t:${Math.floor(row.created_at / 1000)}:R>`).join('\n')
    : 'No blacklist entries.';
}

async function cleanRestrictionRoles(guild, restriction) {
  const cleaned = [];
  for (const roleId of [...new Set(restriction.original_roles || [])]) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (role && !role.managed && role.id !== guild.id) cleaned.push(role.id);
  }
  return cleaned;
}

async function repairRestrictionData(db, guild, userId) {
  const restriction = db.getRestriction(guild.id, userId);
  if (!restriction) throw new Error('No restriction data found for that user.');
  const cleaned = await cleanRestrictionRoles(guild, restriction);
  db.setRestriction(guild.id, userId, {
    active: restriction.active,
    originalRoles: cleaned,
    restrictedBy: restriction.restricted_by,
    reason: restriction.reason || 'Restriction data repaired',
    source: restriction.source || 'rolefix',
    expiresAt: restriction.expires_at,
    lastMessage: restriction.last_message
  });
  return { before: restriction.original_roles.length, after: cleaned.length };
}

async function handleOwnerPrefix(message, db, client, command, args) {
  requireBotOwner(message.author.id);
  const originalCommand = command;
  command = normalizeOwnerCommand(command);

  if (originalCommand === 'banserver') args.unshift('guild');
  if (originalCommand === 'unbanserver') args.unshift('guild');
  if (originalCommand === 'banmember') args.unshift('user');
  if (originalCommand === 'unbanmember') args.unshift('user');
  if (originalCommand === 'blacklistguild') args.unshift('guild');
  if (originalCommand === 'unblacklistguild') args.unshift('guild');
  if (originalCommand === 'blacklistuser') args.unshift('user');
  if (originalCommand === 'unblacklistuser') args.unshift('user');
  if (command === 'db') {
    const sub = String(args.shift() || '').toLowerCase();
    command = sub === 'backup' ? 'dbbackup' : sub === 'stats' ? 'dbstats' : 'db';
  }
  if (command === 'panic') {
    const sub = String(args.shift() || 'mode').toLowerCase();
    command = sub === 'ai' ? 'panicai' : 'panicmode';
  }

  db.recordCommandUsage(command, 'owner-prefix', message.guild?.id || 'dm', message.author.id);

  if (command === 'help') {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild?.id, {
          title: 'Owner Help',
          description: helpSection('owner').lines.join('\n'),
          style: 'royal'
        })
      ]
    });
    return;
  }

  if (command === 'uptime') {
    await message.reply({ embeds: [success(db, message.guild?.id, `Uptime: ${formatDuration(Math.floor(process.uptime() * 1000))}.`)] });
    return;
  }

  if (command === 'guilds') {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild?.id, {
          title: 'Guilds',
          description: client.guilds.cache.map((guild) => `${guild.name} (${guild.id}) - ${guild.memberCount} members`).join('\n').slice(0, 4000) || 'No servers.',
          style: 'royal'
        })
      ]
    });
    return;
  }

  if (command === 'leaveguild') {
    const id = idFromMention(args.shift());
    if (!id) throw new Error('Guild ID is required.');
    const guild = client.guilds.cache.get(id);
    if (!guild) throw new Error('I am not in that guild.');
    const label = `${guild.name} (${guild.id})`;
    if (message.guild?.id === guild.id) {
      await message.reply({ embeds: [success(db, message.guild?.id, `Leaving guild ${label}.`)] });
      await guild.leave();
      return;
    }
    await guild.leave();
    await message.reply({ embeds: [success(db, message.guild?.id, `Left guild ${label}.`)] });
    return;
  }

  if (command === 'broadcast') {
    const targetRaw = args.shift();
    if (!targetRaw) throw new Error('Usage: broadcast all|here|guild_id message');
    const target = targetRaw === 'here' ? message.guild?.id : targetRaw;
    const text = args.join(' ').trim();
    if (!target || !text) throw new Error('Usage: broadcast all|here|guild_id message');
    const result = await sendBroadcast(db, client, target, text);
    await message.reply({ embeds: [success(db, message.guild?.id, `Broadcast sent in ${result.sent}/${result.total} guilds.`)] });
    return;
  }

  if (command === 'ticketpanel') {
    await handleOwnerTicketPanel(message, db, client, args);
    return;
  }

  if (command === 'serversettings') {
    const guild = ownerTargetGuild(client, message, args);
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild?.id || guild.id, {
          title: `Server Settings - ${guild.name}`,
          description: configSummary(db.getAllConfig(guild.id)),
          style: 'royal'
        })
      ]
    });
    return;
  }

  if (command === 'commandusage') {
    const limit = Number(args.shift()) || 15;
    await message.reply({
      embeds: [buildEmbed(db, message.guild?.id, { title: 'Command Usage', description: usageText(db.listCommandUsage(limit)), style: 'ocean' })]
    });
    return;
  }

  if (command === 'riskreport') {
    const guild = args[0] ? ownerTargetGuild(client, message, args) : message.guild;
    const stats = db.databaseStats();
    const flags = db.runtimeFlags();
    const botBans = db.listBotBans(null, 10);
    const fields = [
      { name: 'Runtime', value: runtimeFlagSummary(flags) },
      { name: 'Database', value: `Tables: **${Object.keys(stats.tables).length}**\nRestrictions: **${stats.tables.restrictions || 0}**\nCases: **${stats.tables.cases || 0}**`, inline: true },
      { name: 'Blacklists', value: `${botBans.length} recent entries`, inline: true }
    ];
    if (guild) {
      const config = db.getAllConfig(guild.id);
      const missing = ['restricted_role', 'restrict_logs_channel', 'advanced_logs_channel', 'restricted_users_channel']
        .filter((key) => !config[key]);
      fields.push({
        name: `Guild Risk - ${guild.name}`,
        value: missing.length ? `Missing: ${missing.map((key) => `\`${key}\``).join(', ')}` : 'Critical moderation settings look configured.'
      });
    }
    await message.reply({ embeds: [buildEmbed(db, message.guild?.id || guild?.id, { title: 'Risk Report', fields, style: 'amber' })] });
    return;
  }

  if (command === 'panicmode') {
    const enabled = onOffValue(args.shift(), true);
    db.setGlobalState('panic_mode', enabled);
    db.setGlobalState('maintenance', enabled);
    db.setGlobalState('bot_locked', enabled);
    db.setGlobalState('ai_locked', enabled);
    await message.reply({ embeds: [success(db, message.guild?.id, `Panic mode ${enabled ? 'enabled' : 'disabled'}.`)] });
    return;
  }

  if (command === 'panicai') {
    const enabled = onOffValue(args.shift(), true);
    db.setGlobalState('ai_locked', enabled);
    await message.reply({ embeds: [success(db, message.guild?.id, `AI panic lock ${enabled ? 'enabled' : 'disabled'}.`)] });
    return;
  }

  if (command === 'lock' || command === 'unlock') {
    db.setGlobalState('bot_locked', command === 'lock');
    await message.reply({
      embeds: [success(db, message.guild?.id, command === 'lock'
        ? 'Bot lock enabled. AI actions, moderation, tickets, and dangerous commands are disabled.'
        : 'Bot lock disabled.')]
    });
    return;
  }

  if (command === 'maintenance') {
    const enabled = onOffValue(args.shift(), true);
    db.setGlobalState('maintenance', enabled);
    await message.reply({ embeds: [success(db, message.guild?.id, `Maintenance mode ${enabled ? 'enabled' : 'disabled'}.`)] });
    return;
  }

  if (command === 'dbstats') {
    const stats = db.databaseStats();
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild?.id, {
          title: 'Database Stats',
          description: `File: \`${stats.filePath}\`\n\n${tableCountsText(stats)}`,
          style: 'mono'
        })
      ]
    });
    return;
  }

  if (command === 'dbbackup') {
    const backupPath = db.backupTo(path.join('data', 'backups', `bot-${timestampName()}.sqlite`));
    await message.reply({
      embeds: [success(db, message.guild?.id, `Database backup created: \`${backupPath}\`.`)],
      files: [new AttachmentBuilder(backupPath)]
    });
    return;
  }

  if (command === 'restart' || command === 'shutdown') {
    await message.reply({ embeds: [success(db, message.guild?.id, `${command === 'restart' ? 'Restarting' : 'Shutting down'} now.`)] });
    setTimeout(() => process.exit(command === 'restart' ? 2 : 0), 1000);
    return;
  }

  if (command === 'status') {
    const status = String(args.shift() || '').toLowerCase();
    if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) {
      throw new Error('Usage: status online|idle|dnd|invisible');
    }
    client.user.setStatus(status);
    await message.reply({ embeds: [success(db, message.guild?.id, `Bot status changed to \`${status}\`.`)] });
    return;
  }

  if (command === 'activity') {
    const typeRaw = String(args.shift() || 'playing').toLowerCase();
    const activityText = args.join(' ').trim();
    if (!activityText) throw new Error('Usage: activity playing|watching|listening|competing text');
    const type = ACTIVITY_TYPES[typeRaw] ?? ActivityType.Playing;
    client.user.setActivity(activityText, { type });
    await message.reply({ embeds: [success(db, message.guild?.id, `Activity changed to \`${typeRaw} ${activityText}\`.`)] });
    return;
  }

  if (command === 'blacklist' || command === 'unblacklist') {
    const kindRaw = String(args.shift() || '').toLowerCase();
    const kind = kindRaw.startsWith('guild') || kindRaw === 'server' ? 'guild' : kindRaw.startsWith('user') || kindRaw === 'member' ? 'member' : null;
    const id = idFromMention(args.shift());
    if (!kind || !id) throw new Error(`${command} usage: ${command} user|guild id [reason]`);
    if (kind === 'member' && command === 'blacklist' && isBotOwner(id)) {
      throw new Error('The protected bot owner can not be banned from using the bot.');
    }
    if (command === 'blacklist') db.addBotBan(kind, id, reasonOr(args, 'Blacklisted by owner'));
    else db.removeBotBan(kind, id);
    const guild = kind === 'guild' ? client.guilds.cache.get(id) : null;
    if (command === 'blacklist' && guild && message.guild?.id === guild.id) {
      await message.reply({ embeds: [success(db, message.guild?.id, `Blacklisted guild ${id}. Leaving now.`)] });
      await guild.leave().catch(() => null);
      return;
    }
    if (command === 'blacklist' && guild) await guild.leave().catch(() => null);
    await message.reply({ embeds: [success(db, message.guild?.id, `${command === 'blacklist' ? 'Blacklisted' : 'Unblacklisted'} ${kind} ${id}.`)] });
    return;
  }

  if (command === 'audit') {
    const guild = args[0] ? ownerTargetGuild(client, message, args) : message.guild;
    const limit = Number(args.shift()) || 8;
    const cases = guild ? db.listCases(guild.id, null, limit) : [];
    const bans = db.listBotBans(null, 8);
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild?.id || guild?.id, {
          title: 'Owner Audit',
          fields: [
            { name: 'Runtime', value: runtimeFlagSummary(db.runtimeFlags()) },
            {
              name: guild ? `Recent Cases - ${guild.name}` : 'Recent Cases',
              value: cases.length ? cases.map((entry) => `#${entry.case_id} ${entry.type} <@${entry.target_id}> - ${entry.reason || 'No reason'}`).join('\n').slice(0, 1000) : 'No cases.'
            },
            { name: 'Recent Blacklists', value: botBansText(bans).slice(0, 1000) }
          ],
          style: 'royal'
        })
      ]
    });
    return;
  }

  if (command === 'restoreuser' || command === 'forceunrestrict') {
    const { guild, userId, member } = await ownerTargetMember(client, message, args);
    if (member) {
      const result = await restrictions.unrestrictMember(db, guild, member, message.author, reasonOr(args, command));
      await message.reply({ embeds: [success(db, message.guild?.id || guild.id, `${member} unrestricted/restored. Case #${result.caseId}.`)] });
      return;
    }
    if (command !== 'forceunrestrict') throw new Error('Member is not in the guild. Use forceunrestrict to clear only the database restriction.');
    db.clearRestriction(guild.id, userId);
    await message.reply({ embeds: [success(db, message.guild?.id || guild.id, `Cleared restriction state for ${userId}.`)] });
    return;
  }

  if (command === 'rolefix') {
    const { guild, userId } = await ownerTargetMember(client, message, args);
    const result = await repairRestrictionData(db, guild, userId);
    await message.reply({ embeds: [success(db, message.guild?.id || guild.id, `Restriction role data repaired for ${userId}. Roles: ${result.before} -> ${result.after}.`)] });
    return;
  }

  throw new Error('Owner command not found. Use help, guilds, leaveguild, broadcast, ticket-panel, serversettings, commandusage, riskreport, panic mode, panic ai, db stats, db backup, restart, shutdown, maintenance, status, activity, lock, unlock, blacklist, unblacklist, audit, restoreuser, rolefix, forceunrestrict.');
}

async function handleProgressionPrefix(message, db, client, command, args) {
  if (command === 'daily') {
    const result = progression.claimDaily(db, message.guild.id, message.author.id);
    if (!result.claimed) {
      await message.reply({
        embeds: [
          buildEmbed(db, message.guild.id, {
            title: 'Daily Reward',
            description: `You already claimed daily. Try again <t:${Math.floor(result.nextAt / 1000)}:R>.`,
            style: 'amber'
          })
        ]
      });
      return;
    }

    await message.reply({
      embeds: [
        success(
          db,
          message.guild.id,
          `You claimed **${result.reward} coins**. Streak: **${result.streak}**.\nBalance: **${result.progress.balance} coins**.`
        )
      ]
    });
    return;
  }

  if (command === 'leaderboard') {
    const type = ['balance', 'coins', 'coin'].includes(String(args[0] || '').toLowerCase()) ? 'balance' : 'xp';
    const rows = db.listProgressLeaderboard(message.guild.id, type, 10);
    await message.reply({ embeds: [progression.leaderboardEmbed(db, message.guild, rows, type)] });
    return;
  }

  const user = args[0] ? await resolveUser(client, message.guild, args[0]) : message.author;
  if (!user) throw new Error('User not found.');
  const progress = db.ensureMemberProgress(message.guild.id, user.id);
  const achievements = db.listAchievements(message.guild.id, user.id);

  if (command === 'balance') {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Balance',
          description: `${user} has **${progress.balance || 0} coins**.`,
          style: 'amber'
        })
      ]
    });
    return;
  }

  if (command === 'level') {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Level',
          description: `${user} is **level ${progress.level || 1}** with **${progress.xp || 0} XP**.`,
          style: 'royal'
        })
      ]
    });
    return;
  }

  await message.reply({ embeds: [progression.profileEmbed(db, message.guild, user, progress, achievements)] });
}

async function handleRoleLevelPrefix(message, db, args) {
  const sub = String(args.shift() || 'list').toLowerCase();

  if (sub === 'add' || sub === 'set') {
    const level = Number(args.shift());
    const roleId = idFromMention(args.shift());
    const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
    if (!Number.isFinite(level) || level < 1 || !role) throw new Error('Usage: r!role-level add 5 @Role');
    progression.addRoleReward(db, message.guild.id, level, role.id);
    await message.reply({ embeds: [success(db, message.guild.id, `Level ${level} now rewards ${role}.`)] });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const level = Number(args.shift());
    if (!Number.isFinite(level) || level < 1) throw new Error('Usage: r!role-level remove 5');
    progression.removeRoleReward(db, message.guild.id, level);
    await message.reply({ embeds: [success(db, message.guild.id, `Removed role reward for level ${level}.`)] });
    return;
  }

  const rewards = progression.listRoleRewards(db, message.guild.id);
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Role Level Rewards',
        description: rewards.length
          ? rewards.map((reward) => `Level **${reward.level}** -> <@&${reward.roleId}>`).join('\n')
          : 'No role-level rewards configured.',
        style: 'ocean'
      })
    ]
  });
}

async function deleteSavedStickyMessage(guild, sticky) {
  if (!sticky?.channelId || !sticky?.lastMessageId) return;
  const channel = await guild.channels.fetch(sticky.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const stickyMessage = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
  await stickyMessage?.delete().catch(() => null);
}

async function handleStickyPrefix(message, db, args) {
  const sub = String(args[0] || '').toLowerCase();
  const current = db.getConfig(message.guild.id, 'sticky');

  if (['clear', 'delete', 'disable', 'off', 'remove'].includes(sub)) {
    await deleteSavedStickyMessage(message.guild, current);
    db.setConfig(message.guild.id, 'sticky', null);
    await message.reply({ embeds: [success(db, message.guild.id, 'Sticky message disabled.')] });
    return;
  }

  if (['status', 'show', 'view', 'info'].includes(sub)) {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Sticky Message',
          description: current
            ? [`Channel: <#${current.channelId}>`, `Message: ${current.message}`].join('\n')
            : 'No sticky message is configured.',
          style: current ? 'amber' : 'mono'
        })
      ]
    });
    return;
  }

  const textArgs = ['set', 'on', 'enable', 'update', 'edit'].includes(sub) ? args.slice(1) : args;
  const stickyText = textArgs.join(' ').trim();
  if (!stickyText) throw new Error('Usage: r!sticky set your sticky message, or r!sticky clear.');
  if (stickyText.length > 3900) throw new Error('Sticky messages must be 3900 characters or fewer.');

  await deleteSavedStickyMessage(message.guild, current);
  db.setConfig(message.guild.id, 'sticky', {
    channelId: message.channel.id,
    message: stickyText,
    lastMessageId: null
  });

  await message.reply({ embeds: [success(db, message.guild.id, `Sticky message saved for ${message.channel}.`)] }).catch(() => null);
  const sent = await message.channel.send({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Sticky',
        description: stickyText,
        style: 'amber'
      })
    ]
  }).catch(() => null);

  if (sent) {
    db.setConfig(message.guild.id, 'sticky', {
      channelId: message.channel.id,
      message: stickyText,
      lastMessageId: sent.id
    });
  }
}

async function handlePrefixCommand(message, db, client, command, args) {
  ensureGuild(message);
  if (db.isBotBanned('member', message.author.id) && !isBotOwner(message.author.id)) return;
  db.recordCommandUsage(command, 'prefix', message.guild.id, message.author.id);
  assertNormalCommandUnlocked(db, command);

  if (command === 'help') {
    await message.reply(helpPayload(db, message.guild.id));
    return;
  }
  if (command === 'setup') {
    requireModerator(db, message.member);
    await message.reply(setupHomePayload(db, message.guild.id));
    return;
  }
  if (command === 'ping') {
    await message.reply({ embeds: [success(db, message.guild.id, `Pong. WebSocket: ${Math.round(client.ws.ping)}ms.`)] });
    return;
  }
  if (command === 'afk') {
    db.setAfk(message.guild.id, message.author.id, reasonOr(args, 'AFK'));
    await message.reply({ embeds: [success(db, message.guild.id, 'AFK enabled.')] });
    return;
  }

  if (command === 'sticky') {
    requireModerator(db, message.member);
    await handleStickyPrefix(message, db, args);
    return;
  }

  if (['balance', 'daily', 'profile', 'level', 'leaderboard'].includes(command)) {
    await handleProgressionPrefix(message, db, client, command, args);
    return;
  }

  if (command === 'role-level') {
    requireModerator(db, message.member);
    await handleRoleLevelPrefix(message, db, args);
    return;
  }

  if (command === 'verification') {
    requireModerator(db, message.member);
    const sub = String(args.shift() || 'status').toLowerCase();
    if (sub === 'setup') {
      const channelId = idFromMention(args.shift());
      const roleId = idFromMention(args.shift());
      const channel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : null;
      const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
      if (!channel || !role) throw new Error('Usage: r!verification setup #channel @VerifiedRole [message]');
      await community.sendVerificationPanel(db, message, { channel, role, message: args.join(' ') });
      await message.reply({ embeds: [success(db, message.guild.id, 'Verification panel posted and settings saved.')] });
      return;
    }
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Verification',
          description: [
            `Channel: ${db.getConfig(message.guild.id, 'verification_channel') ? `<#${db.getConfig(message.guild.id, 'verification_channel')}>` : 'Not set'}`,
            `Role: ${db.getConfig(message.guild.id, 'verified_role') ? `<@&${db.getConfig(message.guild.id, 'verified_role')}>` : 'Not set'}`
          ].join('\n'),
          style: 'emerald'
        })
      ]
    });
    return;
  }

  if (command === 'channel-restriction') {
    requireModerator(db, message.member);
    const result = await community.applyChannelRestriction(db, message.guild, channelIdsFromText(args.join(' ')));
    await message.reply({
      embeds: [success(db, message.guild.id, `Restriction visibility synced. Updated ${result.updated} channels, skipped ${result.skipped}. Exempt: ${result.exempt.length || 0}.`)]
    });
    return;
  }

  if (command === 'mass-sync-categories') {
    requireModerator(db, message.member);
    const result = await community.massSyncCategoryPermissions(message.guild);
    await message.reply({ embeds: [success(db, message.guild.id, `Synced ${result.synced} channels with their categories. Skipped ${result.skipped}.`)] });
    return;
  }

  if (command === 'bump') {
    const result = await community.runBump(db, message.guild, message.channel, message.author);
    await message.reply({
      embeds: [
        result.bumped
          ? success(db, message.guild.id, `Bumped. Next bump <t:${Math.floor(result.nextAt / 1000)}:R>.`)
          : buildEmbed(db, message.guild.id, { title: 'Bump Cooldown', description: `Next bump <t:${Math.floor(result.nextAt / 1000)}:R>.`, style: 'amber' })
      ]
    });
    return;
  }

  if (command === 'pet') {
    const sub = String(args.shift() || 'status').toLowerCase();
    let pet;
    if (sub === 'adopt') {
      const result = community.adoptPet(db, message.guild.id, message.author.id, args.join(' '));
      pet = result.pet;
      await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: result.adopted ? 'Pet Adopted' : 'Pet Already Adopted', description: community.petStatusText(pet), style: 'violet' })] });
      return;
    }
    if (sub === 'feed') pet = community.feedPet(db, message.guild.id, message.author.id);
    else if (sub === 'play') pet = community.playPet(db, message.guild.id, message.author.id);
    else pet = community.petStatus(db, message.guild.id, message.author.id);
    if (!pet) throw new Error('Adopt a pet first with r!pet adopt [name].');
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Digital Pet', description: community.petStatusText(pet), style: 'violet' })] });
    return;
  }

  if (command === 'qna') {
    requireModerator(db, message.member);
    const sub = String(args.shift() || 'status').toLowerCase();
    if (sub === 'setup') {
      const channelId = idFromMention(args.shift());
      const channel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : null;
      const personality = args.join(' ').trim();
      if (!channel || !personality) throw new Error('Usage: r!qna setup #channel personality text');
      db.setConfig(message.guild.id, 'qna_channel', channel.id);
      db.setConfig(message.guild.id, 'qna_personality', personality.slice(0, 1000));
      await message.reply({ embeds: [success(db, message.guild.id, `Q&A channel set to ${channel}.`)] });
      return;
    }
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'Q&A',
          description: [
            `Channel: ${db.getConfig(message.guild.id, 'qna_channel') ? `<#${db.getConfig(message.guild.id, 'qna_channel')}>` : 'Not set'}`,
            `Personality: ${db.getConfig(message.guild.id, 'qna_personality') || 'Not set'}`
          ].join('\n'),
          style: 'ocean'
        })
      ]
    });
    return;
  }

  if (command === 'invite-role') {
    await handleInviteRolePrefix(message, db, args);
    return;
  }

  if (command === 'role-invites') {
    await handleRoleInvitesPrefix(message, db, args);
    return;
  }

  if (command === 'invites') {
    await handleInvitesPrefix(message, db, client, args);
    return;
  }

  if (command === 'restrict') {
    requireRestrict(db, message.member);
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    let durationMs = parseDuration(args[0]);
    if (durationMs) args.shift();
    const reason = reasonOr(args);
    const result = await restrictions.restrictMember(db, message.guild, member, message.author, {
      reason,
      durationMs,
      source: 'prefix'
    });
    await restrictions.sendRestrictLog(db, message.guild, member, message.author, result.caseId, reason, 'prefix', null);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} restricted. Case #${result.caseId}.`)] });
    return;
  }

  if (command === 'unrestrict') {
    requireRestrict(db, message.member);
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    const result = await restrictions.unrestrictMember(db, message.guild, member, message.author, reasonOr(args));
    await message.reply({ embeds: [success(db, message.guild.id, `${member} unrestricted. Case #${result.caseId}.`)] });
    return;
  }

  const modCommands = new Set([
    'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'unwarn', 'warnings', 'poll', 'dm', 'say',
    'lock', 'unlock', 'lockdown', 'unlockdown', 'purge', 'note', 'slowmode', 'softban',
    'give-role', 'remove-role', 'voice-mute', 'lock-user', 'unlock-user',
    'temp-role', 'temp-role-remove', 'temp-role-list', 'set-nick', 'remind', 'move',
    'mass-ban', 'case', 'ban-list', 'giveaway', 'steal-emoji', 'steal-sticker'
  ]);
  if (modCommands.has(command)) requireModerator(db, message.member);

  if (command === 'ban') {
    const user = await resolveUser(client, message.guild, args.shift());
    if (!user) throw new Error('User not found.');
    assertNotProtectedOwner(user.id);
    const reason = reasonOr(args);
    await message.guild.members.ban(user.id, { reason });
    const caseId = db.createCase(message.guild.id, 'BAN', user.id, message.author.id, reason);
    await moderationLog(db, message.guild, caseId, 'Ban', user, message.author, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${user} banned. Case #${caseId}.`)] });
    return;
  }

  if (command === 'unban') {
    const userId = idFromMention(args.shift());
    const reason = reasonOr(args);
    await message.guild.members.unban(userId, reason);
    const caseId = db.createCase(message.guild.id, 'UNBAN', userId, message.author.id, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${userId} unbanned. Case #${caseId}.`)] });
    return;
  }

  if (command === 'kick') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    assertNotProtectedOwner(member.id);
    const reason = reasonOr(args);
    await member.kick(reason);
    const caseId = db.createCase(message.guild.id, 'KICK', member.id, message.author.id, reason);
    await moderationLog(db, message.guild, caseId, 'Kick', member.user, message.author, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} kicked. Case #${caseId}.`)] });
    return;
  }

  if (command === 'mute') {
    const member = await resolveMember(message.guild, args.shift());
    const duration = parseDuration(args.shift());
    if (!member || !duration) throw new Error('Usage: r!mute @user 10m reason');
    assertNotProtectedOwner(member.id);
    const reason = reasonOr(args);
    await member.timeout(Math.min(duration, 28 * 24 * 60 * 60 * 1000), reason);
    const caseId = db.createCase(message.guild.id, 'MUTE', member.id, message.author.id, reason, { duration });
    await moderationLog(db, message.guild, caseId, 'Mute', member.user, message.author, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} muted for ${formatDuration(duration)}. Case #${caseId}.`)] });
    return;
  }

  if (command === 'unmute') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    const reason = reasonOr(args);
    await member.timeout(null, reason);
    const caseId = db.createCase(message.guild.id, 'UNMUTE', member.id, message.author.id, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} unmuted. Case #${caseId}.`)] });
    return;
  }

  if (command === 'warn') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    assertNotProtectedOwner(member.id);
    const reason = reasonOr(args);
    const caseId = db.createCase(message.guild.id, 'WARN', member.id, message.author.id, reason);
    db.addWarning(message.guild.id, member.id, message.author.id, reason, caseId);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} warned. Case #${caseId}.`)] });
    return;
  }

  if (command === 'unwarn') {
    const caseId = Number(args.shift());
    db.removeWarning(message.guild.id, caseId);
    await message.reply({ embeds: [success(db, message.guild.id, `Warning case #${caseId} removed.`)] });
    return;
  }

  if (command === 'warnings') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    const rows = db.listWarnings(message.guild.id, member.id);
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: `Warnings for ${member.user.tag}`,
          description: rows.length ? rows.map((row) => `#${row.case_id}: ${row.reason}`).join('\n') : 'No active warnings.',
          style: 'amber'
        })
      ]
    });
    return;
  }

  if (command === 'poll') {
    const joined = args.join(' ');
    const [question, optionText] = joined.split(' |options ');
    const options = (optionText || 'Yes | No').split('|').map((item) => item.trim()).filter(Boolean).slice(0, 9);
    const poll = await message.channel.send({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: question || 'Poll',
          description: options.map((item, index) => `${index + 1}. ${item}`).join('\n'),
          style: 'violet'
        })
      ]
    });
    for (const reaction of ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'].slice(0, options.length)) {
      await poll.react(reaction).catch(() => null);
    }
    return;
  }

  if (command === 'dm') {
    const user = await resolveUser(client, message.guild, args.shift());
    if (!user) throw new Error('User not found.');
    await user.send(args.join(' '));
    await message.reply({ embeds: [success(db, message.guild.id, `DM sent to ${user}.`)] });
    return;
  }

  if (command === 'say') {
    await message.channel.send(args.join(' '));
    return;
  }

  if (command === 'lock' || command === 'unlock') {
    await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: command === 'lock' ? false : null });
    await message.reply({ embeds: [success(db, message.guild.id, `Channel ${command === 'lock' ? 'locked' : 'unlocked'}.`)] });
    return;
  }

  if (command === 'lockdown' || command === 'unlockdown') {
    const deny = command === 'lockdown' ? false : null;
    let count = 0;
    for (const channel of message.guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: deny }).then(() => { count += 1; }).catch(() => null);
      }
    }
    await message.reply({ embeds: [success(db, message.guild.id, `${command === 'lockdown' ? 'Locked' : 'Unlocked'} ${count} text channels.`)] });
    return;
  }

  if (command === 'purge') {
    const amount = Math.max(1, Math.min(100, Number(args.shift()) || 1));
    const deleted = await message.channel.bulkDelete(amount, true);
    await message.channel.send({ embeds: [success(db, message.guild.id, `Deleted ${deleted.size} messages.`)] }).then((msg) => setTimeout(() => msg.delete().catch(() => null), 5000));
    return;
  }

  if (command === 'note') {
    const action = args.shift();
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    if (action === 'add') {
      assertNotProtectedOwner(member.id);
      db.addNote(message.guild.id, member.id, message.author.id, args.join(' '));
      await message.reply({ embeds: [success(db, message.guild.id, `Note added for ${member}.`)] });
    } else {
      const notes = db.listNotes(message.guild.id, member.id);
      await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: `Notes for ${member.user.tag}`, description: notes.map((note) => note.note).join('\n') || 'No notes.', style: 'royal' })] });
    }
    return;
  }

  if (command === 'slowmode') {
    const seconds = Math.max(0, Math.min(21600, Number(args.shift()) || 0));
    await message.channel.setRateLimitPerUser(seconds);
    await message.reply({ embeds: [success(db, message.guild.id, `Slowmode set to ${seconds}s.`)] });
    return;
  }

  if (command === 'softban') {
    const user = await resolveUser(client, message.guild, args.shift());
    if (!user) throw new Error('User not found.');
    assertNotProtectedOwner(user.id);
    const reason = reasonOr(args);
    await message.guild.members.ban(user.id, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
    await message.guild.members.unban(user.id, 'Softban complete');
    const caseId = db.createCase(message.guild.id, 'SOFTBAN', user.id, message.author.id, reason);
    await message.reply({ embeds: [success(db, message.guild.id, `${user} softbanned. Case #${caseId}.`)] });
    return;
  }

  if (command === 'give-role' || command === 'remove-role') {
    const member = await resolveMember(message.guild, args.shift());
    const roleId = idFromMention(args.shift());
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    if (!member || !role) throw new Error('Usage: r!give-role @user @role');
    if (command === 'remove-role') assertNotProtectedOwner(member.id);
    if (command === 'give-role') await member.roles.add(role);
    else await member.roles.remove(role);
    await message.reply({ embeds: [success(db, message.guild.id, `${command === 'give-role' ? 'Gave' : 'Removed'} ${role} ${command === 'give-role' ? 'to' : 'from'} ${member}.`)] });
    return;
  }

  if (command === 'userinfo') {
    const member = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: `User Info - ${member.user.tag}`, description: `${member}\nID: ${member.id}\nRoles: ${member.roles.cache.size - 1}`, thumbnail: member.user.displayAvatarURL(), style: 'sapphire' })] });
    return;
  }

  if (command === 'voice-mute') {
    const member = await resolveMember(message.guild, args.shift());
    const muted = !['false', 'off', 'no', 'unmute'].includes(String(args.shift()).toLowerCase());
    if (!member?.voice.channel) throw new Error('Member is not in voice.');
    assertNotProtectedOwner(member.id);
    await member.voice.setMute(muted);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} voice mute: ${muted}.`)] });
    return;
  }

  if (command === 'lock-user' || command === 'unlock-user') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    if (command === 'lock-user') assertNotProtectedOwner(member.id);
    await message.channel.permissionOverwrites.edit(member.id, { SendMessages: command === 'lock-user' ? false : null });
    await message.reply({ embeds: [success(db, message.guild.id, `${member} updated in this channel.`)] });
    return;
  }

  if (command === 'temp-role') {
    const member = await resolveMember(message.guild, args.shift());
    const roleId = idFromMention(args.shift());
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    const duration = parseDuration(args.shift());
    if (!member || !role || !duration) throw new Error('Usage: r!temp-role @user @role 1h reason');
    assertNotProtectedOwner(member.id);
    const reason = reasonOr(args, 'Temporary role');
    await member.roles.add(role, reason);
    db.addTempRole(message.guild.id, member.id, role.id, message.author.id, reason, Date.now() + duration);
    await message.reply({ embeds: [success(db, message.guild.id, `${role} given to ${member} for ${formatDuration(duration)}.`)] });
    return;
  }

  if (command === 'temp-role-remove') {
    const member = await resolveMember(message.guild, args.shift());
    const roleId = idFromMention(args.shift());
    if (!member || !roleId) throw new Error('Usage: r!temp-role-remove @user @role');
    await member.roles.remove(roleId, 'Temporary role removed');
    db.removeTempRole(message.guild.id, member.id, roleId);
    await message.reply({ embeds: [success(db, message.guild.id, 'Temporary role removed.')] });
    return;
  }

  if (command === 'temp-role-list') {
    const rows = db.listTempRoles(message.guild.id);
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Temporary Roles', description: rows.map((row) => `<@${row.user_id}> <@&${row.role_id}> <t:${Math.floor(row.expires_at / 1000)}:R>`).join('\n') || 'No temporary roles.', style: 'ocean' })] });
    return;
  }

  if (command === 'snipe') {
    const snipe = db.getSnipe(message.guild.id, message.channel.id);
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Snipe', description: snipe?.content || 'No deleted message stored.', style: 'mono' })] });
    return;
  }

  if (command === 'set-nick') {
    const member = await resolveMember(message.guild, args.shift());
    if (!member) throw new Error('Member not found.');
    assertNotProtectedOwner(member.id);
    await member.setNickname(args.join(' '));
    await message.reply({ embeds: [success(db, message.guild.id, `Nickname updated for ${member}.`)] });
    return;
  }

  if (command === 'remind') {
    const duration = parseDuration(args.shift());
    if (!duration) throw new Error('Usage: r!remind 10m message');
    db.addReminder(message.guild.id, message.author.id, message.channel.id, args.join(' '), Date.now() + duration);
    await message.reply({ embeds: [success(db, message.guild.id, `Reminder set for ${formatDuration(duration)}.`)] });
    return;
  }

  if (command === 'move') {
    const member = await resolveMember(message.guild, args.shift());
    const channelId = idFromMention(args.shift());
    const channel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!member || !channel) throw new Error('Usage: r!move @user #voice');
    assertNotProtectedOwner(member.id);
    await member.voice.setChannel(channel);
    await message.reply({ embeds: [success(db, message.guild.id, `${member} moved to ${channel}.`)] });
    return;
  }

  if (command === 'mass-ban') {
    const ids = args.shift()?.split(/[,\s]+/).filter(Boolean) || [];
    const protectedIds = ids.filter((id) => isBotOwner(id));
    const targetIds = ids.filter((id) => !isBotOwner(id));
    const reason = reasonOr(args, 'Mass ban');
    const banned = [];
    for (const id of targetIds) {
      await message.guild.members.ban(id, { reason }).then(() => banned.push(id)).catch(() => null);
    }
    const skipped = protectedIds.length ? ` Skipped ${protectedIds.length} protected owner ID(s).` : '';
    await message.reply({ embeds: [success(db, message.guild.id, `Banned ${banned.length}/${ids.length} users.${skipped}`)] });
    return;
  }

  if (command === 'first-message') {
    const messages = await message.channel.messages.fetch({ limit: 1, after: '0' });
    const first = messages.first();
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'First Message', description: first ? `[Jump](${first.url})\n${first.content || 'No text'}` : 'No message found.', style: 'mono' })] });
    return;
  }

  if (command === 'case') {
    const sub = args.shift();
    const caseId = Number(args.shift());
    if (sub === 'delete') {
      db.deleteCase(message.guild.id, caseId);
      await message.reply({ embeds: [success(db, message.guild.id, `Case #${caseId} deleted.`)] });
      return;
    }
    if (sub === 'change') {
      db.updateCase(message.guild.id, caseId, { reason: args.join(' ') });
      await message.reply({ embeds: [success(db, message.guild.id, `Case #${caseId} updated.`)] });
      return;
    }
    const entry = db.getCase(message.guild.id, Number(sub || caseId));
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: `Case #${entry?.case_id || 'not found'}`, description: entry ? `${entry.type}\nTarget: ${entry.target_id}\nReason: ${entry.reason || 'No reason'}` : 'Case not found.', style: 'royal' })] });
    return;
  }

  if (command === 'ban-list') {
    const bans = await message.guild.bans.fetch();
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Ban List', description: bans.size ? bans.first(25).map((ban) => `${ban.user.tag} (${ban.user.id})`).join('\n') : 'No bans.', style: 'ruby' })] });
    return;
  }

  if (command === 'giveaway') {
    const sub = args.shift();
    if (sub === 'create') {
      const duration = parseDuration(args.shift());
      if (!duration) throw new Error('Usage: r!giveaway create 1h [winners] prize');
      let winnerCount = 1;
      if (/^\d+$/.test(args[0] || '') && args.length > 1) {
        winnerCount = Math.max(1, Math.min(20, Number(args.shift())));
      }
      const prize = args.join(' ').trim();
      if (!prize) throw new Error('Usage: r!giveaway create 1h [winners] prize');
      const giveawayId = `${Date.now()}`;
      const giveawayMessage = await message.channel.send({
        embeds: [
          buildEmbed(db, message.guild.id, {
            title: 'Giveaway',
            description: `Prize: **${prize}**\nWinners: **${winnerCount}**\nEnds: <t:${Math.floor((Date.now() + duration) / 1000)}:R>\nReact with 🎉 to enter.`,
            style: 'rose'
          })
        ]
      });
      await giveawayMessage.react('🎉').catch(() => null);
      db.createGiveaway(message.guild.id, {
        giveawayId,
        channelId: message.channel.id,
        messageId: giveawayMessage.id,
        prize,
        winnerCount,
        endsAt: Date.now() + duration,
        createdBy: message.author.id
      });
      await message.reply({ embeds: [success(db, message.guild.id, `Giveaway created. ID: \`${giveawayId}\`.`)] });
      return;
    }

    if (sub === 'reroll') {
      const giveawayId = args.shift();
      const giveaway = db.getGiveaway(message.guild.id, giveawayId);
      if (!giveaway) throw new Error('Giveaway not found.');
      const channel = await message.guild.channels.fetch(giveaway.channel_id);
      const giveawayMessage = giveaway.message_id ? await channel.messages.fetch(giveaway.message_id).catch(() => null) : null;
      const reaction = giveawayMessage?.reactions.cache.get('🎉');
      const users = reaction ? (await reaction.users.fetch()).filter((user) => !user.bot).map((user) => user) : [];
      const winners = users.sort(() => Math.random() - 0.5).slice(0, giveaway.winner_count);
      await message.reply({
        embeds: [
          success(
            db,
            message.guild.id,
            winners.length ? `Rerolled winners for **${giveaway.prize}**: ${winners.join(', ')}` : 'No eligible users reacted.'
          )
        ]
      });
      return;
    }

    throw new Error('Usage: r!giveaway create 1h [winners] prize OR r!giveaway reroll giveaway_id');
  }

  if (command === 'embed-create') {
    assertAiFeaturesAvailable(db);
    const description = args.join(' ');
    if (!description) throw new Error('Usage: r!embed-create describe the embed you want');
    await message.channel.sendTyping().catch(() => null);
    const generated = await createEmbedFromAI(description);
    await message.channel.send({ embeds: [buildEmbed(db, message.guild.id, embedOptionsFromAI(generated))] });
    return;
  }

  if (command === 'booster-role') {
    if (!message.member.premiumSince && !message.member.roles.premiumSubscriberRole) {
      throw new Error('Only server boosters can create a booster role.');
    }

    const colorArg = args.find((arg) => colorFromInput(arg));
    const imageUrl = args.find((arg) => /^https?:\/\//i.test(arg));
    const roleName = args.filter((arg) => arg !== colorArg && arg !== imageUrl).join(' ').trim();
    if (!roleName) throw new Error('Usage: r!booster-role "Role Name" [#ff00aa] [image_url]');

    const color = colorFromInput(colorArg) || 0x5865f2;
    const existing = db.getBoosterRole(message.guild.id, message.author.id);
    let role = existing ? await message.guild.roles.fetch(existing.role_id).catch(() => null) : null;
    const data = { name: roleName, color, reason: `Booster role for ${message.author.tag}` };

    if (!role) {
      role = await message.guild.roles.create(data);
      db.setBoosterRole(message.guild.id, message.author.id, role.id);
      await message.member.roles.add(role).catch(() => null);
    } else {
      await role.edit(data);
    }

    if (imageUrl && role.setIcon) {
      const response = await fetch(imageUrl).catch(() => null);
      if (response?.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await role.setIcon(buffer).catch(() => null);
      }
    }

    const botTop = message.guild.members.me.roles.highest.position;
    const targetPosition = Math.min(message.member.roles.highest.position + 1, botTop - 1);
    if (targetPosition > 0) await role.setPosition(targetPosition).catch(() => null);
    await message.reply({ embeds: [success(db, message.guild.id, `Booster role ready: ${role}.`)] });
    return;
  }

  if (command === 'game') {
    const name = args.shift() || 'help';
    const opponent = args[0] ? await resolveUser(client, message.guild, args[0]) : null;
    await games.runSimpleGame(
      db,
      {
        guild: message.guild,
        user: message.author,
        reply: (payload) => message.reply(payload)
      },
      name,
      opponent
    );
    return;
  }

  if (command === 'steal-emoji') {
    const source = args.shift();
    const name = args.shift();
    if (!source || !name) throw new Error('Usage: r!steal-emoji <emoji_or_image_url> name');
    const match = source.match(/<a?:\w+:(\d+)>/);
    const url = match
      ? `https://cdn.discordapp.com/emojis/${match[1]}.${source.startsWith('<a:') ? 'gif' : 'png'}`
      : source;
    const emoji = await message.guild.emojis.create({ attachment: url, name });
    await message.reply({ embeds: [success(db, message.guild.id, `Emoji created: ${emoji}`)] });
    return;
  }

  if (command === 'steal-sticker') {
    const url = args.shift();
    const name = args.shift();
    if (!url || !name) throw new Error('Usage: r!steal-sticker <image_url> name');
    const sticker = await message.guild.stickers.create({
      file: url,
      name,
      tags: 'sticker',
      description: `Created by ${message.author.tag}`
    });
    await message.reply({ embeds: [success(db, message.guild.id, `Sticker created: ${sticker.name}`)] });
    return;
  }

  throw new Error('Unknown command. Use help to see commands.');
}

module.exports = {
  slashCommands,
  registerSlashCommands,
  handleSlash,
  handleSetupInteraction,
  handleHelpInteraction,
  handlePrefixMessage,
  handlePrefixCommand,
  helpEmbed,
  helpPayload
};
