const { EmbedBuilder } = require('discord.js');

const EMBED_STYLES = {
  emerald: {
    name: 'Emerald',
    color: 0x2ecc71,
    icon: '✅'
  },
  sapphire: {
    name: 'Sapphire',
    color: 0x3498db,
    icon: '🔷'
  },
  ruby: {
    name: 'Ruby',
    color: 0xe74c3c,
    icon: '🚨'
  },
  amber: {
    name: 'Amber',
    color: 0xf1c40f,
    icon: '⚠️'
  },
  violet: {
    name: 'Violet',
    color: 0x9b59b6,
    icon: '✨'
  },
  ocean: {
    name: 'Ocean',
    color: 0x1abc9c,
    icon: '🌊'
  },
  royal: {
    name: 'Royal',
    color: 0x5865f2,
    icon: '👑'
  },
  rose: {
    name: 'Rose',
    color: 0xff6b9a,
    icon: '🌹'
  },
  mono: {
    name: 'Mono',
    color: 0x95a5a6,
    icon: '◼️'
  },
  cyber: {
    name: 'Cyber',
    color: 0x00f5d4,
    icon: '🛡️'
  }
};

function styleFor(db, guildId, fallback = 'sapphire') {
  const key = db?.getConfig(guildId, 'embed_style', fallback) || fallback;
  return EMBED_STYLES[key] ? key : fallback;
}

function buildEmbed(db, guildId, options = {}) {
  const styleKey = options.style || styleFor(db, guildId);
  const style = EMBED_STYLES[styleKey] || EMBED_STYLES.sapphire;
  const embed = new EmbedBuilder()
    .setColor(options.color ?? style.color)
    .setTimestamp(new Date());

  if (options.title) embed.setTitle(`${options.icon || style.icon} ${options.title}`);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.author) embed.setAuthor(options.author);
  if (options.footer) embed.setFooter(typeof options.footer === 'string' ? { text: options.footer } : options.footer);
  if (options.fields?.length) {
    embed.addFields(
      options.fields.map((field) => ({
        name: String(field.name).slice(0, 256),
        value: String(field.value || 'None').slice(0, 1024),
        inline: Boolean(field.inline)
      }))
    );
  }

  return embed;
}

function success(db, guildId, description, title = 'Success') {
  return buildEmbed(db, guildId, { title, description, style: 'emerald' });
}

function error(db, guildId, description, title = 'Error') {
  return buildEmbed(db, guildId, { title, description, style: 'ruby' });
}

function warning(db, guildId, description, title = 'Warning') {
  return buildEmbed(db, guildId, { title, description, style: 'amber' });
}

function styleList() {
  return Object.entries(EMBED_STYLES)
    .map(([key, value]) => `\`${key}\` - ${value.icon} ${value.name}`)
    .join('\n');
}

module.exports = {
  EMBED_STYLES,
  buildEmbed,
  success,
  error,
  warning,
  styleFor,
  styleList
};
