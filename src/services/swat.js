const { ChannelType, PermissionsBitField } = require('discord.js');
const { DEFAULT_GUILD_CONFIG } = require('../db');
const { buildEmbed, success } = require('../embeds');
const { requireAdmin } = require('../permissions');
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

const NON_ENGLISH_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u0400-\u04ff]/u;

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

function gameLabel(kind) {
  if (kind === 'guess') return 'Episode Guessing Game';
  return (ROLEPLAY_GAMES[kind] || ROLEPLAY_GAMES.case).label;
}

function channelNameConfigKey(kind) {
  if (kind === 'case') return 'swat_case_channel_name';
  if (kind === 'guess') return 'swat_guess_channel_name';
  return 'swat_game_channel_name';
}

const NAME_TEMPLATE_OPTIONS = [
  {
    kind: 'case',
    label: 'Case',
    aliases: ['case', 'cases'],
    key: channelNameConfigKey('case')
  },
  {
    kind: 'game',
    label: 'Game',
    aliases: ['game', 'games', 'roleplay', 'roleplays'],
    key: channelNameConfigKey('game')
  },
  {
    kind: 'guess',
    label: 'Guess',
    aliases: ['guess', 'guesses', 'episode', 'episodes'],
    key: channelNameConfigKey('guess')
  }
];

function categoryConfigKey(kind) {
  if (kind === 'case') return 'swat_case_category';
  if (kind === 'guess') return 'swat_guess_category';
  return 'swat_game_category';
}

function swatChannelName(db, guildId, kind, details = {}) {
  const key = channelNameConfigKey(kind);
  const fallback = DEFAULT_GUILD_CONFIG[key] || 'swat-case';
  const template = db.getConfig(guildId, key, fallback) || fallback;
  const replacements = {
    kind,
    game: gameLabel(kind),
    title: details.title || '',
    theme: details.theme || '',
    episode: details.episode || details.title || ''
  };
  const name = String(template).replace(/\{(kind|game|title|theme|episode)\}/gi, (_, token) => replacements[token.toLowerCase()] || '');
  return cleanChannelName(name, fallback);
}

function cleanChannelName(value, fallback) {
  return String(value || fallback || 'swat-case')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || fallback;
}

function cleanNameTemplate(value, fallback) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || fallback;
}

function nameTemplateOption(input) {
  const value = normalize(input);
  if (value === 'all') return 'all';
  return NAME_TEMPLATE_OPTIONS.find((option) => option.aliases.includes(value)) || null;
}

function nameTemplateValue(db, guildId, option) {
  const fallback = DEFAULT_GUILD_CONFIG[option.key] || 'swat-case';
  return db.getConfig(guildId, option.key, fallback) || fallback;
}

function nameTemplateFields(db, guildId) {
  return NAME_TEMPLATE_OPTIONS.map((option) => ({
    name: `${option.label} channel`,
    value: `\`${option.key}\`\n${nameTemplateValue(db, guildId, option)}`,
    inline: false
  }));
}

async function showNameTemplates(message, db) {
  await message.reply({
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'SWAT Channel Names',
        description: [
          '`swat name case 📺┃𝗦𝘄𝗮𝘁 𝗖𝗮𝘀𝗲` sets the case channel name.',
          '`swat name game {game}` sets every SWAT game channel name.',
          '`swat name guess {episode}` sets episode guessing channel names.',
          '`swat name reset case|game|guess|all` restores defaults.',
          'Placeholders: `{game}`, `{title}`, `{theme}`, `{episode}`, `{kind}`.'
        ].join('\n'),
        fields: nameTemplateFields(db, message.guild.id),
        style: 'cyber'
      })
    ]
  });
}

async function handleNameTemplateCommand(message, db, args) {
  requireAdmin(db, message.member);

  const action = normalize(args[0] || 'show');
  if (!args.length || ['show', 'list', 'status', 'current'].includes(action)) {
    await showNameTemplates(message, db);
    return;
  }

  if (action === 'reset') {
    const option = nameTemplateOption(args[1]);
    if (!option) {
      await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Channel Names', description: 'Use `swat name reset case`, `swat name reset game`, `swat name reset guess`, or `swat name reset all`.', style: 'amber' })] });
      return;
    }
    const options = option === 'all' ? NAME_TEMPLATE_OPTIONS : [option];
    options.forEach((entry) => db.setConfig(message.guild.id, entry.key, DEFAULT_GUILD_CONFIG[entry.key] || 'swat-case'));
    await message.reply({ embeds: [success(db, message.guild.id, `Reset ${option === 'all' ? 'all SWAT channel name templates' : `${option.label.toLowerCase()} channel name template`}.`, 'SWAT Channel Names')] });
    return;
  }

  const startsWithSet = ['set', 'update', 'change'].includes(action);
  const option = nameTemplateOption(startsWithSet ? args[1] : args[0]);
  const templateParts = startsWithSet ? args.slice(2) : args.slice(1);

  if (!option || option === 'all' || !templateParts.join(' ').trim()) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Channel Names', description: 'Use `swat name case 📺┃𝗦𝘄𝗮𝘁 𝗖𝗮𝘀𝗲`, `swat name game {game}`, or `swat name guess {episode}`.', style: 'amber' })] });
    return;
  }

  const fallback = DEFAULT_GUILD_CONFIG[option.key] || 'swat-case';
  const template = cleanNameTemplate(templateParts.join(' '), fallback);
  db.setConfig(message.guild.id, option.key, template);
  await message.reply({ embeds: [success(db, message.guild.id, `${option.label} channel names will now use:\n${template}`, 'SWAT Channel Names')] });
}

async function createSwatChannel(message, db, kind, details = {}) {
  const channelName = swatChannelName(db, message.guild.id, kind, details);
  const configuredCategoryId = db.getConfig(message.guild.id, categoryConfigKey(kind));
  const configuredCategory = configuredCategoryId
    ? message.guild.channels.cache.get(configuredCategoryId)
    : null;
  const parent = configuredCategory?.type === ChannelType.GuildCategory
    ? configuredCategory.id
    : message.channel.parentId || undefined;
  return message.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent,
    topic: `${gameLabel(kind)}. First correct normal message wins; the channel locks when solved.`,
    rateLimitPerUser: 2,
    reason: `SWAT ${kind} started by ${message.author.tag || message.author.id}`
  });
}

async function createGameChannelOrCurrent(message, db, kind, details = {}) {
  return createSwatChannel(message, db, kind, details).catch(() => message.channel);
}

async function lockSwatChannel(channel, guild, reason) {
  if (!channel?.permissionOverwrites?.edit || !guild?.id) return false;
  await channel.permissionOverwrites.edit(
    guild.id,
    { SendMessages: false },
    { reason }
  ).catch(() => null);
  return true;
}

async function grantWinnerRole(message, db, reason) {
  const roleId = db.getConfig(message.guild.id, 'swat_guess_role');
  if (roleId) await message.member?.roles?.add(roleId, reason).catch(() => null);
  return roleId;
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
    'Write every JSON value in English only using Latin-script text. Never use Chinese, Japanese, Korean, Cyrillic, or any other non-English script.',
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
    personality: 'You are a serious English-language SWAT roleplay game master who writes fresh Discord investigations.',
    behavior: 'Return compact valid JSON only. Make each scenario different, cinematic, solvable, and entirely English.',
    maxTokens: 900,
    temperature: 0.95
  }).catch(() => null);
  const parsed = parseJsonObject(answer);
  if (!parsed) return fallback;
  return normalizeScenario(parsed, fallback);
}

function normalizeScenario(data, fallback) {
  const evidence = Array.isArray(data.evidence) ? data.evidence : fallback.evidence;
  const persons = Array.isArray(data.persons) ? data.persons : fallback.persons;
  const aliases = Array.isArray(data.aliases) ? data.aliases : fallback.aliases;
  return {
    title: cleanEnglishText(data.title, fallback.title, 120),
    incident: cleanEnglishText(data.incident, fallback.incident, 700),
    briefing: cleanEnglishText(data.briefing, fallback.briefing, 900),
    scene: cleanEnglishText(data.scene, fallback.scene, 900),
    evidence: englishList(evidence, fallback.evidence, 220, 6),
    persons: englishList(persons, fallback.persons, 220, 6),
    objective: cleanEnglishText(data.objective, fallback.objective, 260),
    solution: cleanEnglishText(data.solution, fallback.solution, 220),
    aliases: englishList([data.solution, ...aliases, ...fallback.aliases], fallback.aliases, 120, 10),
    hint: cleanEnglishText(data.hint, fallback.hint, 260)
  };
}

async function startRoleplay(message, db, kind, theme = '') {
  if (!isModerator(message)) throw new Error('Manage Server permission is required to start a SWAT roleplay game.');
  const gameKind = ROLEPLAY_GAMES[kind] ? kind : 'case';
  const resolvedTheme = resolveSwatTheme(theme);
  const scenario = await generateScenario(gameKind, resolvedTheme, message.author.tag || message.author.username);
  const displayTheme = isRandomTheme(theme) ? 'AI random SWAT story' : resolvedTheme;
  const caseChannel = await createGameChannelOrCurrent(message, db, gameKind, {
    title: scenario.title,
    theme: displayTheme
  });
  const record = {
    ...scenario,
    id: `${Date.now()}`,
    kind: gameKind,
    stateName: gameKind === 'case' ? 'case' : 'game',
    channelId: caseChannel.id,
    commandChannelId: message.channel.id,
    guildId: message.guild.id,
    startedBy: message.author.id,
    createdAt: Date.now(),
    solvedBy: null,
    solvedAt: null,
    points: ROLEPLAY_GAMES[gameKind].points,
    theme: displayTheme
  };
  saveRecord(db, message.guild.id, record);
  if (caseChannel.id === message.channel.id) {
    await showCase(message, db, record);
  } else {
    await caseChannel.send(caseFilePayload(db, message.guild.id, record));
    await message.reply({
      embeds: [
        success(
          db,
          message.guild.id,
          `Created ${caseChannel} for **${record.title}**. Members should answer there with normal messages; AI will judge and lock the channel when solved.`,
          gameKind === 'case' ? 'SWAT Case Created' : 'SWAT Game Created'
        )
      ]
    });
  }
  return record;
}

async function showCase(message, db, record = currentCase(db, message.guild.id)) {
  if (!record) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Case Files', description: 'No active case. Use `swat case new theme` or `swat case new random` to create one. Set `swat_case_channel_name` in the dashboard to control the created channel name.', style: 'amber' })] });
    return;
  }

  await message.reply(caseFilePayload(db, message.guild.id, record));
}

function caseFilePayload(db, guildId, record) {
  const solved = record.solvedBy ? `\n\nSolved by <@${record.solvedBy}> <t:${Math.floor(record.solvedAt / 1000)}:R>.` : '';
  return {
    embeds: [
      buildEmbed(db, guildId, {
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
  };
}

async function showGame(message, db) {
  const record = currentGame(db, message.guild.id);
  if (!record) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'SWAT Game', description: 'No active roleplay game. Use `swat game start hostage theme`. Set `swat_game_channel_name` in the dashboard to control game channel names.', style: 'amber' })] });
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
  if (!records.length) return handleGuessChannelMessage(message, db);

  for (const record of records) {
    if (message.createdTimestamp && Number(message.createdTimestamp) <= Number(record.createdAt || 0)) continue;
    const result = await judgeRoleplayMessage(record, message);
    if (!result.solved) continue;
    await completeRoleplay(message, db, record, result.reason);
    return true;
  }
  return handleGuessChannelMessage(message, db);
}

async function judgeRoleplayMessage(record, message) {
  const content = String(message.content || '').trim();
  if (content.length < 4) return { solved: false, reason: 'Too short.' };

  const localHit = localSolutionHit(record, content);
  if (localHit) return { solved: true, reason: 'Matched the core solution.' };

  const prompt = [
    'You are judging a SWAT Discord roleplay answer.',
    'Return JSON only: {"solved":true/false,"reason":"short reason"}.',
    'The reason must be English only.',
    'Mark solved only if the member clearly identifies the winning theory, culprit, tactic, or decisive evidence.',
    `Scenario title: ${record.title}`,
    `Objective: ${record.objective}`,
    `Secret solution: ${record.solution}`,
    `Acceptable aliases: ${(record.aliases || []).join('; ')}`,
    `Member message: ${content.slice(0, 900)}`
  ].join('\n');
  const answer = await ai.askAI(prompt, {
    personality: 'You are a strict but fair English-language SWAT game judge.',
    behavior: 'Return valid JSON only with English text only.',
    maxTokens: 120,
    temperature: 0.1
  }).catch(() => null);
  const parsed = parseJsonObject(answer);
  return {
    solved: Boolean(parsed?.solved),
    reason: cleanEnglishText(parsed?.reason, 'AI judged the answer correct.', 180)
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

  const roleId = await grantWinnerRole(message, db, 'SWAT roleplay winner');

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
  await lockSwatChannel(message.channel, message.guild, `SWAT ${record.kind} solved by ${message.author.tag || message.author.id}`);
}

async function startGuess(message, db, type = 'mission') {
  if (!isModerator(message)) throw new Error('Manage Server permission is required to start a SWAT guessing game.');
  const episode = EPISODES[Math.floor(Math.random() * EPISODES.length)];
  const guessChannel = await createGameChannelOrCurrent(message, db, 'guess', {
    title: episode.title,
    episode: `S${episode.season}E${episode.episode} ${episode.title}`
  });
  const game = {
    episodeId: episode.id,
    type,
    startedAt: Date.now(),
    channelId: guessChannel.id,
    commandChannelId: message.channel.id,
    winnerId: null
  };
  db.setState(message.guild.id, stateKey('guess'), game);
  const payload = {
    embeds: [
      buildEmbed(db, message.guild.id, {
        title: 'Episode Guessing Game',
        description: [
          `Channel: <#${guessChannel.id}>`,
          `${guessingPrompt(type, episode)}`,
          '',
          'First member to answer in this channel wins. The old `swat guess episode title` command still works too.'
        ].join('\n'),
        style: 'violet'
      })
    ]
  };

  if (guessChannel.id === message.channel.id) {
    await message.reply(payload);
  } else {
    await guessChannel.send(payload);
    await message.reply({
      embeds: [
        success(
          db,
          message.guild.id,
          `Created ${guessChannel} for the episode guessing game. Members can answer there with normal messages.`,
          'SWAT Guess Created'
        )
      ]
    });
  }
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
  if (!localEpisodeHit(episode, answer, 2)) {
    await message.reply({ embeds: [buildEmbed(db, message.guild.id, { title: 'Episode Guess', description: 'Not quite. Keep investigating.', style: 'amber' })] });
    return;
  }
  await completeGuess(message, db, game, episode, 'Matched the episode title.', true);
}

async function handleGuessChannelMessage(message, db) {
  const game = db.getState(message.guild.id, stateKey('guess'), null);
  if (!game || game.winnerId || game.channelId !== message.channel.id) return false;
  if (message.createdTimestamp && Number(message.createdTimestamp) <= Number(game.startedAt || 0)) return false;
  const episode = EPISODES.find((entry) => entry.id === game.episodeId);
  if (!episode) return false;

  const result = await judgeGuessMessage(game, episode, message);
  if (!result.solved) return false;
  await completeGuess(message, db, game, episode, result.reason, false);
  return true;
}

async function judgeGuessMessage(game, episode, message) {
  const content = String(message.content || '').trim();
  if (content.length < 2) return { solved: false, reason: 'Too short.' };
  if (localEpisodeHit(episode, content, 3)) return { solved: true, reason: 'Matched the episode title.' };

  const prompt = [
    'You are judging a SWAT Discord episode guessing answer.',
    'Return JSON only: {"solved":true/false,"reason":"short reason"}.',
    'The reason must be English only.',
    'Mark solved only if the member is clearly answering with this exact episode title or season/episode.',
    'Ignore casual discussion, character names, and partial guesses that are not enough to identify the episode.',
    `Clue type: ${game.type}`,
    `Correct title: ${episode.title}`,
    `Correct season episode: S${episode.season}E${episode.episode}`,
    `Mission: ${episode.mission}`,
    `Member message: ${content.slice(0, 500)}`
  ].join('\n');
  const answer = await ai.askAI(prompt, {
    personality: 'You are a strict but fair English-language SWAT episode game judge.',
    behavior: 'Return valid JSON only with English text only.',
    maxTokens: 100,
    temperature: 0.1
  }).catch(() => null);
  const parsed = parseJsonObject(answer);
  return {
    solved: Boolean(parsed?.solved),
    reason: cleanEnglishText(parsed?.reason, 'AI judged the episode answer correct.', 180)
  };
}

async function completeGuess(message, db, game, episode, reason, replyToMessage) {
  game.winnerId = message.author.id;
  game.solvedAt = Date.now();
  db.setState(message.guild.id, stateKey('guess'), game);
  savePoints(db, message.guild.id, message.author.id, 25, { win: true, type: 'episode_guess', title: episode.title });
  const roleId = await grantWinnerRole(message, db, 'SWAT episode guessing winner');
  const gameChannel = game.channelId
    ? await message.guild.channels.fetch(game.channelId).catch(() => null)
    : null;

  const payload = {
    embeds: [
      success(
        db,
        message.guild.id,
        [
          `Correct. It was **${episode.title}**.`,
          `${message.author} earned **25 SWAT points**.`,
          `Reason: ${reason || 'Correct episode.'}`,
          roleId ? `Reward role: <@&${roleId}>` : 'Set a SWAT reward role in setup to grant a role too.',
          'Channel locked for game closed.'
        ].join('\n'),
        'SWAT Guess Closed'
      )
    ],
    allowedMentions: { users: [message.author.id], roles: [] }
  };

  if (replyToMessage) {
    if (gameChannel && gameChannel.id !== message.channel.id) {
      await gameChannel.send({ content: `${message.author}`, ...payload }).catch(() => null);
    }
    await message.reply(payload);
  } else {
    await message.channel.send({ content: `${message.author}`, ...payload });
  }
  await lockSwatChannel(gameChannel || message.channel, message.guild, `SWAT episode guess solved by ${message.author.tag || message.author.id}`);
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
    'Write every award title and reason in English only using Latin-script text.',
    'Use each member stats to decide who gets what award. Make award names tactical and different.',
    'Return {"awards":[{"userId":"","title":"","reason":""}]}',
    JSON.stringify(payload)
  ].join('\n'), {
    personality: 'You are an English-language SWAT season awards commissioner.',
    behavior: 'Return compact valid JSON only with English text only.',
    maxTokens: 500,
    temperature: 0.75
  }).catch(() => null);
  const parsed = parseJsonObject(answer);
  const awards = Array.isArray(parsed?.awards) ? parsed.awards : [];
  return awards
    .map((award) => {
      const row = rows.find(([userId]) => userId === String(award.userId));
      if (!row) return null;
      return {
        userId: row[0],
        points: row[1],
        title: cleanEnglishText(award.title, 'Season Operator', 80),
        reason: cleanEnglishText(award.reason, 'Strong season performance.', 220)
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
            '`swat case new theme` or `swat case add theme` creates a SWAT case channel.',
            '`swat case new random` creates an original SWAT-only story when the moderator has no idea.',
            '`swat game start hostage theme` creates an AI-judged roleplay game channel.',
            '`swat name case|game|guess template` sets dashboard-backed channel names.',
            '`swat name reset case|game|guess|all` restores default channel names.',
            'Dashboard names: `swat_case_channel_name`, `swat_game_channel_name`, `swat_guess_channel_name`.',
            'Name placeholders: `{game}`, `{title}`, `{theme}`, `{episode}`, `{kind}`.',
            '`swat games` lists custom SWAT game types.',
            '`swat case` / `swat game` shows the active file.',
            '`swat guess start quote|screenshot|dialogue|mission` / `swat guess episode title`',
            '`swat awards` lets AI decide season awards from SWAT history.',
            'Cases and all SWAT games are solved by normal messages in the created channel. No multiple choices.'
          ].join('\n'),
          style: 'sapphire'
        })
      ]
    });
    return true;
  }

  if (command === 'name' || command === 'names' || command === 'channelname' || command === 'channelnames') {
    await handleNameTemplateCommand(message, db, args);
    return true;
  }

  if (command === 'setup' && normalize(args[0]) === 'names') {
    await handleNameTemplateCommand(message, db, args.slice(1));
    return true;
  }

  if (command === 'case') {
    if (['new', 'start', 'create', 'add'].includes(normalize(args[0]))) {
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
    if (['new', 'start', 'create', 'add'].includes(first)) {
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

async function handleSwatNameInteraction(interaction, db) {
  const subcommand = interaction.options.getSubcommand(false) || 'show';
  if (subcommand === 'set') {
    await handleNameTemplateCommand(interaction, db, [
      interaction.options.getString('kind'),
      interaction.options.getString('template')
    ]);
    return;
  }
  if (subcommand === 'reset') {
    await handleNameTemplateCommand(interaction, db, [
      'reset',
      interaction.options.getString('kind')
    ]);
    return;
  }
  await handleNameTemplateCommand(interaction, db, []);
}

function localSolutionHit(record, content) {
  const haystack = normalize(content);
  return (record.aliases || [])
    .map((alias) => normalize(alias))
    .filter((alias) => alias.length >= 4)
    .some((alias) => haystack.includes(alias));
}

function localEpisodeHit(episode, content, minLength = 2) {
  const guess = normalize(content);
  if (!guess || guess.length < minLength) return false;
  const title = normalize(episode.title);
  const seasonEpisode = normalize(`s${episode.season}e${episode.episode}`);
  const spacedSeasonEpisode = normalize(`season ${episode.season} episode ${episode.episode}`);
  const accepted = [title, seasonEpisode, spacedSeasonEpisode];
  return accepted.some((answer) => answer === guess || answer.includes(guess) || guess.includes(answer));
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

function cleanEnglishText(value, fallback, maxLength) {
  const text = cleanText(value, '', maxLength)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-');
  if (!text || NON_ENGLISH_SCRIPT_RE.test(text)) return cleanText(fallback, '', maxLength);
  return text;
}

function englishList(values, fallbackValues, maxLength, limit) {
  const cleaned = (Array.isArray(values) ? values : [])
    .map((item) => cleanEnglishText(item, '', maxLength))
    .filter(Boolean)
    .slice(0, limit);
  if (cleaned.length) return cleaned;
  return (Array.isArray(fallbackValues) ? fallbackValues : [])
    .map((item) => cleanText(item, '', maxLength))
    .filter(Boolean)
    .slice(0, limit);
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
  handleSwatNameInteraction,
  handleSwatRoleplayMessage
};
