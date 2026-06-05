const { PermissionsBitField } = require('discord.js');
const { buildEmbed, success } = require('../embeds');
const ai = require('./ai');

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

const ROLEPLAY_GAMES = {
  case: {
    label: 'Full Investigation',
    objective: 'Find the real suspect, motive, and decisive evidence.',
    points: 60
  },
  hostage: {
    label: 'Hostage Negotiation',
    objective: 'Identify the safest negotiation move and hidden leverage.',
    points: 40
  },
  breach: {
    label: 'Breach Plan',
    objective: 'Call the correct entry plan, hazard, and arrest priority.',
    points: 40
  },
  dispatch: {
    label: 'Dispatch Decode',
    objective: 'Decode the radio traffic and name the exact response location.',
    points: 35
  },
  evidence: {
    label: 'Evidence Board',
    objective: 'Connect the clue chain and name what proves the case.',
    points: 35
  },
  interrogation: {
    label: 'Interrogation Read',
    objective: 'Spot the lie and state what pressure point breaks the suspect.',
    points: 35
  },
  patrol: {
    label: 'Street Patrol',
    objective: 'Find the suspicious detail before the situation escalates.',
    points: 30
  },
  pursuit: {
    label: 'Vehicle Pursuit',
    objective: 'Predict the route and call the safe containment point.',
    points: 35
  },
  rescue: {
    label: 'Rescue Operation',
    objective: 'Name the rescue path and the danger that must be neutralized.',
    points: 40
  },
  undercover: {
    label: 'Undercover Sting',
    objective: 'Expose the contact phrase, buyer, and meet location.',
    points: 45
  }
};

const RANDOM_SWAT_THEMES = [
  'an armored convoy ambush with a missing witness and a staged radio call',
  'a hostage standoff at a courthouse with a hidden evidence-room motive',
  'a warehouse raid where the suspect is leaking SWAT movements from inside dispatch',
  'a bank robbery where the getaway vehicle is a decoy and the real exit is underground',
  'a hospital lockdown where the target is a protected informant, not the patient',
  'a school-night alarm call that reveals a weapons handoff behind the gym',
  'a downtown sniper scare where the shots are covering a data theft',
  'a port authority raid where container numbers expose the inside contact',
  'an undercover buy that turns into a double-cross at a parking structure',
  'a rescue call in storm drains where the victim left clues in emergency code'
];

function stateKey(name) {
  return `swat:${name}`;
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isRandomTheme(theme) {
  const value = normalize(theme);
  return !value || ['random', 'rand', 'surprise', 'surprise me', 'anything', 'any'].includes(value);
}

function resolveSwatTheme(theme) {
  if (!isRandomTheme(theme)) return cleanText(theme, 'a tactical SWAT investigation', 180);
  return RANDOM_SWAT_THEMES[Math.floor(Math.random() * RANDOM_SWAT_THEMES.length)];
}

function isModerator(message) {
  return message.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild);
}

function currentCase(db, guildId) {
  return db.getState(guildId, stateKey('case'), null);
}

function currentGame(db, guildId) {
  return db.getState(guildId, stateKey('game'), null);
}

function saveRecord(db, guildId, record) {
  db.setState(guildId, stateKey(record.stateName || 'case'), record);
}

function savePoints(db, guildId, userId, amount, event = {}) {
  const points = db.getState(guildId, stateKey('points'), {});
  points[userId] = Number(points[userId] || 0) + amount;
  db.setState(guildId, stateKey('points'), points);

  const events = db.getState(guildId, stateKey('events'), {});
  const userEvents = events[userId] || { wins: 0, points: 0, history: [] };
  userEvents.wins += event.win ? 1 : 0;
  userEvents.points += amount;
  userEvents.history = [
    {
      type: event.type || 'points',
      title: event.title || 'SWAT points',
      points: amount,
      at: Date.now()
    },
    ...(userEvents.history || [])
  ].slice(0, 20);
  events[userId] = userEvents;
  db.setState(guildId, stateKey('events'), events);
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

function fallbackScenario(kind, theme) {
  const game = ROLEPLAY_GAMES[kind] || ROLEPLAY_GAMES.case;
  const safeTheme = resolveSwatTheme(theme);
  return {
    title: `${game.label}: ${titleCase(safeTheme)}`,
    incident: `A SWAT callout turns into a layered roleplay investigation around ${safeTheme}.`,
    briefing: `The team arrives with partial radio traffic, conflicting witnesses, and one detail that does not fit. Members must discuss the scene in-character and post their theory in this channel.`,
    scene: 'The first unit finds a blocked service entrance, a silent phone on the ground, fresh tire marks, and a witness who remembers the wrong color vehicle.',
    evidence: [
      'The dispatch timestamp is two minutes earlier than the witness claimed.',
      'A maintenance badge opens the side door but not the main office.',
      'The cleanest fingerprint is on the evidence bag, not the weapon.'
    ],
    persons: [
      'A nervous security guard who keeps checking the loading dock.',
      'A courier who knows the radio code but says they never entered.',
      'A bystander with a perfect view of the wrong street.'
    ],
    objective: game.objective,
    solution: 'the courier used the maintenance badge and staged the radio call',
    aliases: ['courier maintenance badge', 'staged radio call', 'courier did it', 'maintenance badge courier'],
    hint: 'Look for the person who knows too much about access and timing.'
  };
}

async function generateScenario(kind, theme, moderatorTag) {
  const game = ROLEPLAY_GAMES[kind] || ROLEPLAY_GAMES.case;
  const resolvedTheme = resolveSwatTheme(theme);
  const fallback = fallbackScenario(kind, resolvedTheme);
  const prompt = [
    'Create one original SWAT roleplay investigation as JSON only.',
    'Only use realistic SWAT, tactical police, investigation, hostage, rescue, raid, dispatch, evidence, or pursuit ideas.',
    'Do not use fantasy, superheroes, sci-fi, school tests, generic party games, or non-SWAT plots.',
    'No multiple choice options. Players solve by writing theories in the channel.',
    `Game type: ${game.label}`,
    `Moderator theme: ${resolvedTheme}`,
    `Moderator: ${moderatorTag || 'unknown'}`,
    `Objective: ${game.objective}`,
    'Return this exact JSON shape:',
    '{"title":"","incident":"","briefing":"","scene":"","evidence":["","",""],"persons":["","",""],"objective":"","solution":"","aliases":["","",""],"hint":""}',
    'The solution must be a specific phrase or theory that a player can naturally write.'
  ].join('\n');

  const answer = await ai.askAI(prompt, {
    personality: 'You are a serious SWAT roleplay game master who writes fresh Discord investigations.',
    behavior: 'Return compact valid JSON only. Make each scenario different, cinematic, and solvable.',
    maxTokens: 900,
    temperature: 0.95
  });
  const parsed = parseJsonObject(answer);
  if (!parsed) return fallback;
  return normalizeScenario(parsed, fallback);
}

function normalizeScenario(data, fallback) {
  const evidence = Array.isArray(data.evidence) ? data.evidence : fallback.evidence;
  const persons = Array.isArray(data.persons) ? data.persons : fallback.persons;
  const aliases = Array.isArray(data.aliases) ? data.aliases : fallback.aliases;
  return {
    title: cleanText(data.title, fallback.title, 120),
    incident: cleanText(data.incident, fallback.incident, 700),
    briefing: cleanText(data.briefing, fallback.briefing, 900),
    scene: cleanText(data.scene, fallback.scene, 900),
    evidence: evidence.map((item) => cleanText(item, '', 220)).filter(Boolean).slice(0, 6),
    persons: persons.map((item) => cleanText(item, '', 220)).filter(Boolean).slice(0, 6),
    objective: cleanText(data.objective, fallback.objective, 260),
    solution: cleanText(data.solution, fallback.solution, 220),
    aliases: [data.solution, ...aliases, ...fallback.aliases].map((item) => cleanText(item, '', 120)).filter(Boolean).slice(0, 10),
    hint: cleanText(data.hint, fallback.hint, 260)
  };
}

async function startRoleplay(message, db, kind, theme = '') {
  if (!isModerator(message)) throw new Error('Manage Server permission is required to start a SWAT roleplay game.');
  const gameKind = ROLEPLAY_GAMES[kind] ? kind : 'case';
  const resolvedTheme = resolveSwatTheme(theme);
  const scenario = await generateScenario(gameKind, resolvedTheme, message.author.tag || message.author.username);
  const record = {
    ...scenario,
    id: `${Date.now()}`,
    kind: gameKind,
    stateName: gameKind === 'case' ? 'case' : 'game',
    channelId: message.channel.id,
    guildId: message.guild.id,
    startedBy: message.author.id,
    createdAt: Date.now(),
    solvedBy: null,
    solvedAt: null,
    points: ROLEPLAY_GAMES[gameKind].points,
    theme: isRandomTheme(theme) ? 'AI random SWAT story' : resolvedTheme
  };
  saveRecord(db, message.guild.id, record);
  await showCase(message, db, record);
  return record;
}

async function showCase(message, db, record = currentCase(db, message.guild.id)) {
  if (!record) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Case Files', description: 'No active case. Use `swat case new theme` or `swat case new random` to create one.', style: 'amber' })] });
    return;
  }

  const solved = record.solvedBy ? `\n\nSolved by <@${record.solvedBy}> <t:${Math.floor(record.solvedAt / 1000)}:R>.` : '';
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: `Case File - ${record.title}`,
        description: [
          `Channel: <#${record.channelId}>`,
          `Theme: **${record.theme || 'AI generated'}**`,
          `Objective: ${record.objective}`,
          '',
          'Members solve this by posting theories in this channel. No multiple choices.'
        ].join('\n') + solved,
        fields: [
          { name: 'Incident', value: fieldValue(record.incident) },
          { name: 'Briefing', value: fieldValue(record.briefing) },
          { name: 'Scene Report', value: fieldValue(record.scene) },
          { name: 'Evidence Board', value: fieldValue(record.evidence.map((item) => `- ${item}`).join('\n')) },
          { name: 'Persons Of Interest', value: fieldValue(record.persons.map((item) => `- ${item}`).join('\n')) },
          { name: 'Detective Hint', value: record.hint || 'Watch the details.', inline: false }
        ],
        style: record.solvedBy ? 'emerald' : 'royal'
      })
    ]
  });
}

async function showGame(message, db) {
  const record = currentGame(db, message.guild.id);
  if (!record) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Game', description: 'No active roleplay game. Use `swat game start hostage theme`.', style: 'amber' })] });
    return;
  }
  await showCase(message, db, record);
}

function gamesList() {
  return Object.entries(ROLEPLAY_GAMES)
    .filter(([key]) => key !== 'case')
    .map(([key, game]) => `\`${key}\` - ${game.label}: ${game.objective}`)
    .join('\n');
}

async function handleSwatRoleplayMessage(message, db) {
  if (!message.guild || message.author.bot || !message.content.trim()) return false;
  const records = [currentCase(db, message.guild.id), currentGame(db, message.guild.id)]
    .filter((record) => record && !record.solvedBy && record.channelId === message.channel.id);
  if (!records.length) return false;

  for (const record of records) {
    if (message.createdTimestamp && Number(message.createdTimestamp) <= Number(record.createdAt || 0)) continue;
    const result = await judgeRoleplayMessage(record, message);
    if (!result.solved) continue;
    await completeRoleplay(message, db, record, result.reason);
    return true;
  }
  return false;
}

async function judgeRoleplayMessage(record, message) {
  const content = String(message.content || '').trim();
  if (content.length < 4) return { solved: false, reason: 'Too short.' };

  const localHit = localSolutionHit(record, content);
  if (localHit) return { solved: true, reason: 'Matched the core solution.' };

  const prompt = [
    'You are judging a SWAT Discord roleplay answer.',
    'Return JSON only: {"solved":true/false,"reason":"short reason"}.',
    'Mark solved only if the member clearly identifies the winning theory, culprit, tactic, or decisive evidence.',
    `Scenario title: ${record.title}`,
    `Objective: ${record.objective}`,
    `Secret solution: ${record.solution}`,
    `Acceptable aliases: ${(record.aliases || []).join('; ')}`,
    `Member message: ${content.slice(0, 900)}`
  ].join('\n');
  const answer = await ai.askAI(prompt, {
    personality: 'You are a strict but fair SWAT game judge.',
    behavior: 'Return valid JSON only.',
    maxTokens: 120,
    temperature: 0.1
  });
  const parsed = parseJsonObject(answer);
  return {
    solved: Boolean(parsed?.solved),
    reason: cleanText(parsed?.reason, 'AI judged the answer correct.', 180)
  };
}

async function completeRoleplay(message, db, record, reason) {
  record.solvedBy = message.author.id;
  record.solvedAt = Date.now();
  record.winningMessage = message.content.slice(0, 500);
  saveRecord(db, message.guild.id, record);
  savePoints(db, message.guild.id, message.author.id, record.points || 40, {
    win: true,
    type: record.kind,
    title: record.title
  });

  const roleId = db.getConfig(message.guild.id, 'swat_guess_role');
  if (roleId) await message.member.roles.add(roleId, 'SWAT roleplay winner').catch(() => null);
  await message.channel.permissionOverwrites.edit(
    message.guild.id,
    { SendMessages: false },
    { reason: `SWAT ${record.kind} solved by ${message.author.tag || message.author.id}` }
  ).catch(() => null);

  await message.channel.send({
    content: `${message.author}`,
    embeds: [
      success(
        db,
        message.guild.id,
        [
          `${message.author} cracked **${record.title}** and earned **${record.points || 40} SWAT points**.`,
          `Reason: ${reason || 'Correct theory.'}`,
          roleId ? `Reward role: <@&${roleId}>` : 'Set a SWAT reward role in setup to grant a role too.',
          'Channel locked for case closed.'
        ].join('\n'),
        'SWAT Case Closed'
      )
    ],
    allowedMentions: { users: [message.author.id], roles: [] }
  }).catch(() => null);
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

function guessingPrompt(type, episode) {
  if (type === 'quote') return `Quote: "${episode.quote}"`;
  if (type === 'dialogue') return `Dialogue clue: ${episode.quote}`;
  if (type === 'screenshot') return `Screenshot clue: imagine a tactical board for **${episode.tags.slice(0, 3).join(', ')}**.`;
  return `Mission: ${episode.mission}`;
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
  savePoints(db, message.guild.id, message.author.id, 25, { win: true, type: 'episode_guess', title: episode.title });
  const roleId = db.getConfig(message.guild.id, 'swat_guess_role');
  if (roleId) await message.member.roles.add(roleId, 'SWAT episode guessing winner').catch(() => null);
  await message.reply({ embeds: [success(db, message.guild.id, `Correct. It was **${episode.title}**. ${message.author} earned **25 SWAT points**.`)] });
}

async function showAwards(message, db) {
  const points = db.getState(message.guild.id, stateKey('points'), {});
  const events = db.getState(message.guild.id, stateKey('events'), {});
  const rows = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Season Awards', description: 'No SWAT points yet. Solve cases and roleplay games first.', style: 'royal' })] });
    return;
  }

  const aiAwards = await decideSeasonAwards(rows, events);
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'AI Season Awards',
        description: aiAwards.length
          ? aiAwards.map((award) => `**${award.title}** - <@${award.userId}> (${award.points} points)\n${award.reason}`).join('\n\n').slice(0, 3900)
          : fallbackAwards(rows),
        footer: 'AI decides award titles from points, wins, and roleplay history.',
        style: 'royal'
      })
    ]
  });
}

async function decideSeasonAwards(rows, events) {
  const payload = rows.map(([userId, points]) => ({
    userId,
    points,
    wins: events[userId]?.wins || 0,
    recent: (events[userId]?.history || []).slice(0, 5).map((entry) => `${entry.type}:${entry.title}:${entry.points}`)
  }));
  const answer = await ai.askAI([
    'Assign SWAT season awards as JSON only.',
    'Use each member stats to decide who gets what award. Make award names tactical and different.',
    'Return {"awards":[{"userId":"","title":"","reason":""}]}',
    JSON.stringify(payload)
  ].join('\n'), {
    personality: 'You are a SWAT season awards commissioner.',
    behavior: 'Return compact valid JSON only.',
    maxTokens: 500,
    temperature: 0.75
  });
  const parsed = parseJsonObject(answer);
  const awards = Array.isArray(parsed?.awards) ? parsed.awards : [];
  return awards
    .map((award) => {
      const row = rows.find(([userId]) => userId === String(award.userId));
      if (!row) return null;
      return {
        userId: row[0],
        points: row[1],
        title: cleanText(award.title, 'Season Operator', 80),
        reason: cleanText(award.reason, 'Strong season performance.', 220)
      };
    })
    .filter(Boolean);
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
            '`swat case new theme` starts a big AI investigation in this channel.',
            '`swat case new random` creates an original SWAT-only story when the moderator has no idea.',
            '`swat game start hostage theme` starts an AI-judged roleplay game.',
            '`swat games` lists custom SWAT game types.',
            '`swat case` / `swat game` shows the active file.',
            '`swat guess start quote|screenshot|dialogue|mission` / `swat guess episode title`',
            '`swat awards` lets AI decide season awards from SWAT history.',
            'Cases and roleplay games are solved by normal messages in the start channel. No multiple choices.'
          ].join('\n'),
          style: 'sapphire'
        })
      ]
    });
    return true;
  }

  if (command === 'case') {
    if (['new', 'start', 'create'].includes(normalize(args[0]))) {
      await startRoleplay(message, db, 'case', args.slice(1).join(' '));
      return true;
    }
    await showCase(message, db);
    return true;
  }

  if (command === 'games') {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Games', description: gamesList(), style: 'cyber' })] });
    return true;
  }

  if (command === 'game') {
    const first = normalize(args[0] || '');
    if (['new', 'start', 'create'].includes(first)) {
      const kind = normalize(args[1] || 'hostage');
      await startRoleplay(message, db, kind, args.slice(2).join(' '));
      return true;
    }
    if (ROLEPLAY_GAMES[first]) {
      await startRoleplay(message, db, first, args.slice(1).join(' '));
      return true;
    }
    await showGame(message, db);
    return true;
  }

  if (command === 'scan' || command === 'clue' || command === 'choice' || command === 'choose') {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Roleplay', description: 'Choices and scan commands are retired. Post your theory in the case channel and AI will judge it automatically.', style: 'amber' })] });
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

function localSolutionHit(record, content) {
  const haystack = normalize(content);
  return (record.aliases || [])
    .map((alias) => normalize(alias))
    .filter((alias) => alias.length >= 4)
    .some((alias) => haystack.includes(alias));
}

function parseJsonObject(text) {
  const value = String(text || '').trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return (text || fallback || '').slice(0, maxLength);
}

function fieldValue(value) {
  return cleanText(value, 'None', 1024);
}

function fallbackAwards(rows) {
  const labels = ['Prime Investigator', 'Tactical Lead', 'Evidence Specialist', 'Comms Operator', 'Rapid Response'];
  return rows
    .map(([userId, score], index) => `**${labels[index] || `Operator #${index + 1}`}** - <@${userId}> (${score} points)`)
    .join('\n');
}

function titleCase(value) {
  return String(value || '')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .slice(0, 80);
}

module.exports = {
  handleSwatMessage,
  handleSwatRoleplayMessage
};
