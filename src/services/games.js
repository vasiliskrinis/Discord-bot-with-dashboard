const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { buildEmbed } = require('../embeds');

const EIGHT_BALL = [
  'Yes.',
  'No.',
  'Maybe.',
  'Very likely.',
  'Not today.',
  'Ask again later.',
  'The signs point to yes.',
  'The signs point to no.'
];

const SLOT_SYMBOLS = ['Cherry', 'Lemon', 'Bell', 'Star', 'Seven'];

const TRIVIA = [
  { question: 'What color do you get when you mix red and blue?', answer: 'Purple' },
  { question: 'How many sides does a hexagon have?', answer: 'Six' },
  { question: 'What is the largest planet in our solar system?', answer: 'Jupiter' },
  { question: 'Which number is the only even prime number?', answer: '2' },
  { question: 'What does CPU stand for?', answer: 'Central Processing Unit' }
];

const SCRAMBLE_WORDS = ['discord', 'moderation', 'server', 'ticket', 'booster', 'channel', 'command'];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeGameName(name) {
  const key = String(name || '').toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    ttt: 'tictactoe',
    xo: 'tictactoe',
    coin: 'coinflip',
    flip: 'coinflip',
    eightball: '8ball',
    '8-ball': '8ball',
    slot: 'slots',
    scrambleword: 'scramble'
  };
  return aliases[key] || key;
}

async function runSimpleGame(db, interaction, name, opponent) {
  name = normalizeGameName(name);

  if (name === 'coinflip') {
    await interaction.reply({ embeds: [buildEmbed(db, interaction.guild.id, { title: 'Coin Flip', description: randomItem(['Heads', 'Tails']), style: 'amber' })] });
    return;
  }
  if (name === 'dice') {
    await interaction.reply({ embeds: [buildEmbed(db, interaction.guild.id, { title: 'Dice', description: `You rolled **${Math.floor(Math.random() * 6) + 1}**.`, style: 'ocean' })] });
    return;
  }
  if (name === '8ball') {
    await interaction.reply({ embeds: [buildEmbed(db, interaction.guild.id, { title: '8 Ball', description: randomItem(EIGHT_BALL), style: 'violet' })] });
    return;
  }
  if (name === 'rps') {
    const bot = randomItem(['rock', 'paper', 'scissors']);
    await interaction.reply({ embeds: [buildEmbed(db, interaction.guild.id, { title: 'Rock Paper Scissors', description: `I picked **${bot}**.`, style: 'sapphire' })] });
    return;
  }
  if (name === 'tictactoe') {
    await startTicTacToe(db, interaction, opponent);
    return;
  }
  if (name === 'slots') {
    const rolls = [randomItem(SLOT_SYMBOLS), randomItem(SLOT_SYMBOLS), randomItem(SLOT_SYMBOLS)];
    const unique = new Set(rolls).size;
    const result = unique === 1 ? 'Jackpot. All three matched.' : unique === 2 ? 'Small win. Two symbols matched.' : 'No match this time.';
    await interaction.reply({
      embeds: [buildEmbed(db, interaction.guild.id, { title: 'Slots', description: `**${rolls.join(' | ')}**\n${result}`, style: unique === 1 ? 'rose' : 'amber' })]
    });
    return;
  }
  if (name === 'trivia') {
    const item = randomItem(TRIVIA);
    await interaction.reply({
      embeds: [
        buildEmbed(db, interaction.guild.id, {
          title: 'Trivia',
          description: `${item.question}\n\nAnswer: ||${item.answer}||`,
          style: 'royal'
        })
      ]
    });
    return;
  }
  if (name === 'roulette') {
    const result = randomItem(['Red', 'Black', 'Green']);
    await interaction.reply({
      embeds: [buildEmbed(db, interaction.guild.id, { title: 'Roulette', description: `The wheel landed on **${result}**.`, style: result === 'Green' ? 'emerald' : 'ruby' })]
    });
    return;
  }
  if (name === 'scramble') {
    const word = randomItem(SCRAMBLE_WORDS);
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    await interaction.reply({
      embeds: [buildEmbed(db, interaction.guild.id, { title: 'Word Scramble', description: `Unscramble: **${scrambled}**\nAnswer: ||${word}||`, style: 'ocean' })]
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildEmbed(db, interaction.guild.id, {
        title: 'Games',
        description: '`tictactoe`, `coinflip`, `dice`, `rps`, `8ball`, `slots`, `trivia`, `roulette`, `scramble`',
        style: 'sapphire'
      })
    ],
    ephemeral: true
  });
}

async function startTicTacToe(db, interaction, opponent) {
  const players = [interaction.user.id, opponent?.id].filter(Boolean);
  const state = {
    board: Array(9).fill(null),
    turn: 0,
    players,
    marks: ['X', 'O']
  };

  const message = await interaction.reply({
    embeds: [renderBoardEmbed(db, interaction.guild.id, state, interaction.user, opponent)],
    components: renderBoardRows(state),
    fetchReply: true
  });

  const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });
  collector.on('collect', async (button) => {
    const index = Number(button.customId.split(':')[1]);
    const currentPlayer = state.players[state.turn % state.players.length] || button.user.id;
    if (state.players.length > 1 && button.user.id !== currentPlayer) {
      await button.reply({ content: 'It is not your turn.', ephemeral: true });
      return;
    }
    if (state.board[index]) {
      await button.reply({ content: 'That spot is already taken.', ephemeral: true });
      return;
    }

    if (!state.players.includes(button.user.id)) state.players.push(button.user.id);
    state.board[index] = state.marks[state.turn % 2];
    state.turn += 1;
    const winner = winnerFor(state.board);
    const done = Boolean(winner || state.board.every(Boolean));
    await button.update({
      embeds: [renderBoardEmbed(db, interaction.guild.id, state, interaction.user, opponent, winner)],
      components: renderBoardRows(state, done)
    });
    if (done) collector.stop('done');
  });
}

function renderBoardEmbed(db, guildId, state, starter, opponent, winner = null) {
  const rows = [0, 3, 6]
    .map((start) => state.board.slice(start, start + 3).map((cell) => cell || '-').join(' | '))
    .join('\n');
  const description = winner
    ? `Winner: **${winner}**\n\n\`\`\`\n${rows}\n\`\`\``
    : `Turn: **${state.marks[state.turn % 2]}**\n\n\`\`\`\n${rows}\n\`\`\``;
  return buildEmbed(db, guildId, {
    title: 'Tic Tac Toe',
    description,
    fields: [
      { name: 'Player 1', value: `${starter}`, inline: true },
      { name: 'Player 2', value: opponent ? `${opponent}` : 'Open seat', inline: true }
    ],
    style: 'cyber'
  });
}

function renderBoardRows(state, disabled = false) {
  const rows = [];
  for (let row = 0; row < 3; row += 1) {
    const actionRow = new ActionRowBuilder();
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt:${index}`)
          .setLabel(state.board[index] || ' ')
          .setStyle(state.board[index] === 'X' ? ButtonStyle.Primary : state.board[index] === 'O' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled || Boolean(state.board[index]))
      );
    }
    rows.push(actionRow);
  }
  return rows;
}

function winnerFor(board) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

module.exports = {
  runSimpleGame
};
