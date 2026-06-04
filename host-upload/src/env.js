const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(file = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function botTokens() {
  const numberedKeys = Object.keys(process.env)
    .filter((key) => /^DISCORD_TOKEN_\d+$/.test(key))
    .sort((left, right) => Number(left.match(/\d+$/)[0]) - Number(right.match(/\d+$/)[0]));

  return uniqueList([
    process.env.DISCORD_TOKEN,
    ...list(process.env.DISCORD_TOKENS),
    ...numberedKeys.map((key) => process.env[key])
  ]);
}

loadDotEnv();

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  tokens: botTokens(),
  clientId: process.env.CLIENT_ID || '',
  botOwnerId: process.env.BOT_OWNER_ID || '',
  enableSlashCommands: bool(process.env.ENABLE_SLASH_COMMANDS, true),
  enablePrefixCommands: bool(process.env.ENABLE_PREFIX_COMMANDS, true),
  defaultPrefix: process.env.DEFAULT_PREFIX || 'r!',
  ownerPrefix: process.env.OWNER_PREFIX || 'oc',
  swatPrefix: process.env.SWAT_PREFIX || 'swat',
  swatGuildId: process.env.SWAT_GUILD_ID || '',
  hfApiKey: process.env.HUGGING_FACE_API_KEY || '',
  hfModel: process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct:fastest',
  aiTimeoutMs: int(process.env.AI_TIMEOUT_MS, 12000),
  aiMaxTokens: int(process.env.AI_MAX_TOKENS, 120),
  aiPersonality: process.env.AI_PERSONALITY || 'Helpful, friendly, strict about safety, and concise.',
  aiBehavior:
    process.env.AI_BEHAVIOR ||
    'Help server members, assist moderators, and create Discord embeds from plain descriptions.',
  aiModeration: bool(process.env.AI_MODERATION, true),
  aiModerationBlockWords: list(process.env.AI_MODERATION_BLOCK_WORDS),
  databasePath: process.env.DATABASE_PATH || 'data/bot.sqlite',
  registerSlashOnReady: bool(process.env.REGISTER_SLASH_ON_READY, true),
  dashboardEnabled: bool(process.env.DASHBOARD_ENABLED, true),
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',
  dashboardPort: int(process.env.PORT || process.env.SERVER_PORT || process.env.DASHBOARD_PORT, 3000),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || ''
};
