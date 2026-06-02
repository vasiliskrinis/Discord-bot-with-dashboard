const UNITS = {
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000
};

function parseDuration(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (['perm', 'permanent', 'forever', 'none', '0'].includes(value)) return null;

  const match = value.match(/^(\d+)\s*([a-z]+)$/i);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = UNITS[match[2]];
  if (!amount || !unit) return null;
  return amount * unit;
}

function formatDuration(ms) {
  if (!ms) return 'Permanent';
  const parts = [
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000]
  ];

  for (const [name, size] of parts) {
    if (ms >= size) {
      const amount = Math.floor(ms / size);
      return `${amount} ${name}${amount === 1 ? '' : 's'}`;
    }
  }

  return `${ms} ms`;
}

function timestamp(ms) {
  return Math.floor(ms / 1000);
}

module.exports = {
  parseDuration,
  formatDuration,
  timestamp
};
