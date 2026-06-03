# Discord Custom Bot

This bot implements the pasted spec as a Discord.js project with:

- Slash commands and `r!` prefix commands.
- Owner-only `oc` prefix commands.
- Restriction, temporary restriction, restriction channel, saved roles, leave/rejoin restore, and protected bot owner ID.
- Advanced logs, moderation logs, restrict logs, review channels, accept/decline buttons, past logs, and restricted-user summary channel.
- Ban, kick, mute, unmute, unban, warn, unwarn, warnings, cases, case edit/delete, ban list, mass ban, soft ban, channel locks, lockdown, purges, notes, slowmode, temp roles, and more utility commands.
- Configured admin users/roles and authorized review roles.
- Roblox/executor update channels using the requested APIs.
- Embed style switching with saved styles.
- Multiple ticket panels with one ticket per user per panel and AI help text.
- Hugging Face AI on bot mentions, AI embed creator, AI moderation checks, and simple natural-language moderation commands.
- Booster custom roles, counting channel, welcome messages, member count voice channel, games, reminders, giveaways, snipes, sticky messages, AFK, polls, emoji/sticker steal helpers, and voice utilities.
- SQLite persistence with `node:sqlite` at `data/bot.sqlite`.
- Per-server database configs, so each guild has its own channels, roles, logs, style, tickets, counting, welcome, update channels, and state.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Edit `.env`:

   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_client_id
   BOT_OWNER_ID=your_discord_user_id
   ```

3. Start the bot:

   ```bash
   npm start
   ```

Slash commands are registered separately in every guild the bot is in when `REGISTER_SLASH_ON_READY=true`. No guild ID is needed in `.env`.
Roblox/executor update channels are configured per server, and the bot sends update messages only when the API data changes after the first saved snapshot.

## Web Dashboard

The bot starts a local dashboard with the process:

```text
http://127.0.0.1:3000
```

Dashboard settings live in `.env`:

```env
DASHBOARD_ENABLED=true
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=
```

By default it is local-only. Set `DASHBOARD_PASSWORD` before binding `DASHBOARD_HOST` to anything public or remote. The dashboard shows bot uptime, gateway ping, connected servers, runtime locks, command usage, database table counts, per-server settings, active restrictions, recent cases, tickets, reminders, giveaways, and watcher state. It can also update runtime locks, bot presence, and per-server config values.

## Setup Menu

Use one command for all server configuration:

```text
/setup
r!setup
```

The setup menu configures:

- Restrict role, restrict permissions role, and update ping role.
- Restrict trap, advanced logs, restrict logs, restricted users, Roblox updates, executor updates, counting, welcome, and member-count channels.
- Admin users, admin roles, and restrict-review authorized roles.
- Embed style.
- Welcome message, sticky message, and ticket panels.
- Clear/reset saved channels, roles, access lists, welcome text, and sticky messages.

## Bot Owner Prefix

Owner-only controls use the owner prefix from `.env` (`OWNER_PREFIX`, default `oc`) and are not registered as slash commands.

Examples:

```text
oc guilds
oc leaveguild guild_id
oc broadcast all message
oc serversettings guild_id
oc commandusage
oc riskreport
oc panic mode on
oc panic ai on
oc lock
oc unlock
oc maintenance on
oc db stats
oc db backup
oc status dnd
oc activity watching server logs
oc blacklist user user_id reason
oc unblacklist guild guild_id
oc audit guild_id
oc restoreuser guild_id user_id
oc rolefix guild_id user_id
oc forceunrestrict guild_id user_id
oc restart
oc shutdown
```

## AI

There is no standalone AI command. Mention the bot in a server channel to talk to AI, or use `/embed-create` / `r!embed-create` to describe an embed and have AI build it.

Prefix commands use the same names where practical, for example:

```text
r!restrict @user 1d reason
r!unrestrict @user reason
r!ban @user reason
r!help
```

Owner-only commands use the owner prefix:

```text
oc uptime
oc servers
oc banserver SERVER_ID reason
oc banmember USER_ID reason
```

## Important Discord Permissions

Give the bot a role above every role it needs to remove, restore, mute, or create. The restricted role and booster custom roles also need to sit below the bot's top role.
