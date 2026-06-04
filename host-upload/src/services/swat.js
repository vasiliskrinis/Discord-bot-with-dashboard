const { PermissionsBitField } = require('discord.js');
const { buildEmbed, success } = require('../embeds');

const EPISODES = [
  {
    id: 's1e1',
    season: 1,
    episode: 1,
    title: 'Pilot',
    mission: 'A newly formed team responds to a volatile city incident while Street joins the unit.',
    tags: ['street', 'team', 'recruit', 'hostage'],
    characters: ['Hondo', 'Deacon', 'Street', 'Tan', 'Chris', 'Luca'],
    quote: 'Stay liquid, stay ready.'
  },
  {
    id: 's1e2',
    season: 1,
    episode: 2,
    title: 'Cuchillo',
    mission: 'The team tracks a fugitive while pressure builds around Street proving himself.',
    tags: ['street', 'fugitive', 'manhunt'],
    characters: ['Hondo', 'Street', 'Tan', 'Chris', 'Luca'],
    quote: 'Trust the team and move.'
  },
  {
    id: 's1e7',
    season: 1,
    episode: 7,
    title: 'Homecoming',
    mission: 'A hostage threat forces the team to balance speed, negotiation, and safety.',
    tags: ['hostage', 'negotiation', 'family'],
    characters: ['Hondo', 'Deacon', 'Tan', 'Chris'],
    quote: 'Every second has a cost.'
  },
  {
    id: 's2e5',
    season: 2,
    episode: 5,
    title: 'S.O.S.',
    mission: 'Tan and the team handle a crisis that tests communication and discipline.',
    tags: ['tan', 'rescue', 'crisis'],
    characters: ['Hondo', 'Deacon', 'Street', 'Tan', 'Chris', 'Luca'],
    quote: 'Clear comms, clear heads.'
  },
  {
    id: 's3e8',
    season: 3,
    episode: 8,
    title: 'Lion\'s Den',
    mission: 'An armed robbery investigation expands into a larger tactical problem.',
    tags: ['robbery', 'armed robbery', 'downtown', 'strategy'],
    characters: ['Hondo', 'Street', 'Tan', 'Chris'],
    quote: 'We do this by the book.'
  },
  {
    id: 's4e12',
    season: 4,
    episode: 12,
    title: 'U-Turn',
    mission: 'The team faces a moving threat and a series of split-second choices.',
    tags: ['pursuit', 'strategy', 'tan'],
    characters: ['Hondo', 'Deacon', 'Tan', 'Luca'],
    quote: 'Read the street before it reads you.'
  }
];

const CASE_TEMPLATES = [
  {
    title: 'Armed robbery at downtown bank',
    description: 'A downtown bank was hit by a disciplined crew. Members must scan channels for clues, then choose how the team moves.',
    clues: [
      'Security footage shows a gray van leaving through an alley.',
      'A witness heard the crew mention a warehouse by the river.',
      'One robber used police radio language incorrectly.',
      'The getaway route avoids every major camera except the bus depot.'
    ],
    endings: {
      negotiate: 'The team stalls the crew, rescues hostages, and arrests the planner.',
      breach: 'The team breaches fast, catches two suspects, but the planner escapes.',
      track: 'The team tracks the van to the warehouse and recovers the stolen cash.'
    }
  },
  {
    title: 'Hostage situation at a courthouse',
    description: 'A suspect takes hostages after a failed escape attempt. Clues reveal motive, risk, and the safest ending.',
    clues: [
      'The suspect asks for a specific public defender.',
      'A dropped note says the real target is evidence storage.',
      'One hostage is quietly signaling the number three.',
      'The suspect has no exit driver.'
    ],
    endings: {
      negotiate: 'Negotiators isolate the motive and end the standoff cleanly.',
      breach: 'The breach succeeds, but one clue about evidence storage is missed.',
      track: 'The team catches the accomplice near evidence storage.'
    }
  }
];

function stateKey(name) {
  return `swat:${name}`;
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isModerator(message) {
  return message.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild);
}

function currentCase(db, guildId) {
  return db.getState(guildId, stateKey('case'), null);
}

function savePoints(db, guildId, userId, amount) {
  const points = db.getState(guildId, stateKey('points'), {});
  points[userId] = Number(points[userId] || 0) + amount;
  db.setState(guildId, stateKey('points'), points);
  return points[userId];
}

function episodeLine(episode) {
  return `S${episode.season}E${episode.episode} **${episode.title}** - ${episode.mission}`;
}

function searchEpisodes(query) {
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 2);
  if (!terms.length) return EPISODES;
  return EPISODES.filter((episode) => {
    const haystack = normalize([
      episode.title,
      episode.mission,
      episode.tags.join(' '),
      episode.characters.join(' '),
      episode.quote
    ].join(' '));
    return terms.some((term) => haystack.includes(term));
  });
}

function mostAppearances(name) {
  const needle = normalize(name);
  const matches = EPISODES.filter((episode) => episode.characters.some((character) => normalize(character).includes(needle)));
  return {
    count: matches.length,
    episodes: matches
  };
}

function startCase(db, guild) {
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const template = CASE_TEMPLATES[week % CASE_TEMPLATES.length];
  const channels = [...guild.channels.cache.values()]
    .filter((channel) => channel.isTextBased?.())
    .slice(0, Math.max(1, template.clues.length));
  const hiddenClues = template.clues.map((clue, index) => ({
    clue,
    channelId: channels[index % channels.length]?.id || null,
    foundBy: null,
    foundAt: null
  }));
  const record = {
    id: `${week}`,
    title: template.title,
    description: template.description,
    clues: hiddenClues,
    endings: template.endings,
    choice: null,
    createdAt: Date.now()
  };
  db.setState(guild.id, stateKey('case'), record);
  return record;
}

async function showCase(message, db, record = currentCase(db, message.guild.id)) {
  if (!record) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Case Files', description: 'No active case. Use `swat case new` to create one.', style: 'amber' })] });
    return;
  }
  const found = record.clues.filter((clue) => clue.foundBy).length;
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: `Case File - ${record.title}`,
        description: `${record.description}\n\nClues found: **${found}/${record.clues.length}**\nChoices: \`${Object.keys(record.endings).join('`, `')}\``,
        style: 'royal'
      })
    ]
  });
}

async function scanChannel(message, db) {
  const record = currentCase(db, message.guild.id);
  if (!record) throw new Error('No active SWAT case.');
  const clue = record.clues.find((entry) => entry.channelId === message.channel.id && !entry.foundBy);
  if (!clue) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Scan', description: 'No fresh clue found in this channel.', style: 'mono' })] });
    return;
  }
  clue.foundBy = message.author.id;
  clue.foundAt = Date.now();
  db.setState(message.guild.id, stateKey('case'), record);
  savePoints(db, message.guild.id, message.author.id, 10);
  await message.reply({ embeds: [success(db, message.guild.id, `Clue found: ${clue.clue}\nYou earned **10 SWAT points**.`)] });
}

async function chooseEnding(message, db, choice) {
  const record = currentCase(db, message.guild.id);
  if (!record) throw new Error('No active SWAT case.');
  const key = normalize(choice).split(' ')[0];
  if (!record.endings[key]) throw new Error(`Choose one: ${Object.keys(record.endings).join(', ')}`);
  record.choice = key;
  db.setState(message.guild.id, stateKey('case'), record);
  savePoints(db, message.guild.id, message.author.id, 15);
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: `Case Ending - ${key}`,
        description: `${record.endings[key]}\n\n${message.author} earned **15 SWAT points** for the community choice.`,
        style: 'emerald'
      })
    ]
  });
}

function guessingPrompt(type, episode) {
  if (type === 'quote') return `Quote: "${episode.quote}"`;
  if (type === 'dialogue') return `Dialogue clue: ${episode.quote}`;
  if (type === 'screenshot') return `Screenshot clue: imagine a tactical board for **${episode.tags.slice(0, 3).join(', ')}**.`;
  return `Mission: ${episode.mission}`;
}

async function startGuess(message, db, type = 'mission') {
  if (!isModerator(message)) throw new Error('Manage Server permission is required to start a SWAT guessing game.');
  const episode = EPISODES[Math.floor(Math.random() * EPISODES.length)];
  const game = {
    episodeId: episode.id,
    type,
    startedAt: Date.now(),
    winnerId: null
  };
  db.setState(message.guild.id, stateKey('guess'), game);
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Episode Guessing Game',
        description: `${guessingPrompt(type, episode)}\n\nFirst member to answer with \`swat guess episode title\` wins.`,
        style: 'violet'
      })
    ]
  });
}

async function guessEpisode(message, db, answer) {
  const game = db.getState(message.guild.id, stateKey('guess'), null);
  if (!game || game.winnerId) throw new Error('No active SWAT guessing game.');
  const episode = EPISODES.find((entry) => entry.id === game.episodeId);
  if (!episode) throw new Error('The active guessing game is missing its episode.');
  const expected = normalize(`${episode.title} s${episode.season}e${episode.episode}`);
  if (!normalize(answer) || !expected.includes(normalize(answer))) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Episode Guess', description: 'Not quite. Keep investigating.', style: 'amber' })] });
    return;
  }
  game.winnerId = message.author.id;
  db.setState(message.guild.id, stateKey('guess'), game);
  savePoints(db, message.guild.id, message.author.id, 25);
  const roleId = db.getConfig(message.guild.id, 'swat_guess_role');
  if (roleId) await message.member.roles.add(roleId, 'SWAT episode guessing winner').catch(() => null);
  await message.reply({ embeds: [success(db, message.guild.id, `Correct. It was **${episode.title}**. ${message.author} earned **25 SWAT points**.`)] });
}

async function showAwards(message, db) {
  const points = db.getState(message.guild.id, stateKey('points'), {});
  const rows = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const labels = ['Best Detective', 'Best Strategist', 'Best Recruit', 'Most Active Operator'];
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Season Awards',
        description: rows.length
          ? rows.map(([userId, score], index) => `**${labels[index] || `Operator #${index + 1}`}** - <@${userId}> (${score} points)`).join('\n')
          : 'No SWAT points yet. Find clues, choose endings, and win episode guesses.',
        style: 'royal'
      })
    ]
  });
}

async function handleSwatMessage(message, db, raw) {
  const [commandRaw, ...args] = raw.trim().split(/\s+/);
  const command = normalize(commandRaw || 'help');
  const rest = args.join(' ');

  if (command === 'help') {
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: 'SWAT Help',
          description: [
            '`swat case` / `swat case new` / `swat scan` / `swat choice negotiate|breach|track`',
            '`swat episodes with Street` / `swat episodes involving hostage situations`',
            '`swat most appearances of Tan`',
            '`swat guess start quote|screenshot|dialogue|mission` / `swat guess episode title`',
            '`swat awards`'
          ].join('\n'),
          style: 'sapphire'
        })
      ]
    });
    return true;
  }

  if (command === 'case') {
    if (normalize(args[0]) === 'new') {
      if (!isModerator(message)) throw new Error('Manage Server permission is required to create a new case.');
      await showCase(message, db, startCase(db, message.guild));
      return true;
    }
    await showCase(message, db);
    return true;
  }

  if (command === 'scan' || command === 'clue') {
    await scanChannel(message, db);
    return true;
  }

  if (command === 'choice' || command === 'choose') {
    await chooseEnding(message, db, rest);
    return true;
  }

  if (command === 'guess') {
    if (normalize(args[0]) === 'start') {
      await startGuess(message, db, normalize(args[1] || 'mission'));
      return true;
    }
    await guessEpisode(message, db, rest);
    return true;
  }

  if (command === 'awards') {
    await showAwards(message, db);
    return true;
  }

  if (command === 'most') {
    const name = rest.replace(/^appearances\s+of\s+/i, '').trim();
    const result = mostAppearances(name || 'Tan');
    await message.reply({
      embeds: [
        buildEmbed(db, message.guild.id, {
          title: `SWAT Database - ${name || 'Tan'}`,
          description: `${name || 'Tan'} appears in **${result.count}** starter database episode(s).\n\n${result.episodes.map(episodeLine).join('\n') || 'No matches.'}`,
          style: 'ocean'
        })
      ]
    });
    return true;
  }

  const query = raw
    .replace(/^show\s+all\s+/i, '')
    .replace(/^episodes\s+/i, '')
    .replace(/^database\s+/i, '')
    .replace(/^with\s+/i, '')
    .replace(/^involving\s+/i, '');
  const matches = searchEpisodes(query);
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'SWAT Database',
        description: matches.length ? matches.map(episodeLine).join('\n').slice(0, 3900) : 'No starter database matches.',
        style: 'ocean'
      })
    ]
  });
  return true;
}

module.exports = {
  handleSwatMessage
};
