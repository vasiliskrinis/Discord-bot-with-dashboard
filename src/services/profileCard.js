const zlib = require('node:zlib');

const COLORS = {
  transparent: [0, 0, 0, 0],
  dark: [31, 37, 40, 255],
  darkAlt: [38, 45, 49, 255],
  panel: [47, 55, 60, 210],
  panelSoft: [57, 66, 72, 180],
  cyan: [74, 190, 188, 255],
  red: [255, 76, 82, 255],
  white: [245, 248, 250, 255],
  muted: [137, 148, 160, 255],
  avatar: [129, 140, 153, 255],
  shadow: [11, 14, 16, 75]
};

const FONT = {
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  '!': ['1', '1', '1', '1', '1', '0', '1'],
  '"': ['101', '101', '000', '000', '000', '000', '000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '$': ['01110', '10100', '10100', '01110', '00101', '00101', '11110'],
  '%': ['11001', '11010', '00100', '01000', '10110', '00110', '00000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '\'': ['1', '1', '0', '0', '0', '0', '0'],
  '(': ['01', '10', '10', '10', '10', '10', '01'],
  ')': ['10', '01', '01', '01', '01', '01', '10'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  ',': ['00', '00', '00', '00', '00', '10', '10'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['0', '0', '0', '0', '0', '0', '1'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  ':': ['0', '1', '0', '0', '0', '1', '0'],
  ';': ['0', '1', '0', '0', '0', '1', '1'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '=': ['00000', '11111', '00000', '11111', '00000', '00000', '00000'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '[': ['11', '10', '10', '10', '10', '10', '11'],
  '\\': ['10000', '01000', '00100', '00010', '00001', '00000', '00000'],
  ']': ['11', '01', '01', '01', '01', '01', '11'],
  '^': ['00100', '01010', '10001', '00000', '00000', '00000', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '`': ['10', '01', '00', '00', '00', '00', '00'],
  '{': ['001', '010', '010', '100', '010', '010', '001'],
  '|': ['1', '1', '1', '1', '1', '1', '1'],
  '}': ['100', '010', '010', '001', '010', '010', '100'],
  '~': ['00000', '00000', '01001', '10110', '00000', '00000', '00000'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['010', '110', '010', '010', '010', '010', '111'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['00111', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '11100']
};

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
  }

  setPixel(x, y, color) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const index = (py * this.width + px) * 4;
    const alpha = color[3] ?? 255;
    if (alpha >= 255 || this.pixels[index + 3] === 0) {
      this.pixels[index] = color[0];
      this.pixels[index + 1] = color[1];
      this.pixels[index + 2] = color[2];
      this.pixels[index + 3] = alpha;
      return;
    }

    const srcA = alpha / 255;
    const dstA = this.pixels[index + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    this.pixels[index] = Math.round((color[0] * srcA + this.pixels[index] * dstA * (1 - srcA)) / outA);
    this.pixels[index + 1] = Math.round((color[1] * srcA + this.pixels[index + 1] * dstA * (1 - srcA)) / outA);
    this.pixels[index + 2] = Math.round((color[2] * srcA + this.pixels[index + 2] * dstA * (1 - srcA)) / outA);
    this.pixels[index + 3] = Math.round(outA * 255);
  }

  fillRect(x, y, width, height, color) {
    const x1 = Math.max(0, Math.floor(x));
    const y1 = Math.max(0, Math.floor(y));
    const x2 = Math.min(this.width, Math.ceil(x + width));
    const y2 = Math.min(this.height, Math.ceil(y + height));
    for (let py = y1; py < y2; py += 1) {
      for (let px = x1; px < x2; px += 1) {
        this.setPixel(px, py, color);
      }
    }
  }

  fillRoundedRect(x, y, width, height, radius, color) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    const x2 = Math.ceil(x + width);
    const y2 = Math.ceil(y + height);
    for (let py = y1; py < y2; py += 1) {
      for (let px = x1; px < x2; px += 1) {
        if (insideRoundedRect(px + 0.5, py + 0.5, x, y, width, height, r)) {
          this.setPixel(px, py, color);
        }
      }
    }
  }

  fillCircle(cx, cy, radius, color) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.setPixel(x, y, color);
      }
    }
  }

  fillPolygon(points, color, clip = null) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (clip && !clip(x + 0.5, y + 0.5)) continue;
        if (insidePolygon(x + 0.5, y + 0.5, points)) this.setPixel(x, y, color);
      }
    }
  }

  drawText(text, x, y, scale, color, options = {}) {
    const maxWidth = options.maxWidth || Infinity;
    const value = fitText(printable(text), maxWidth, scale);
    let cursor = Math.round(x);
    for (const character of value) {
      const glyph = glyphFor(character);
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] !== '1') continue;
          this.fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
      cursor += (glyph[0].length + 1) * scale;
    }
    return cursor - x;
  }

  toPng() {
    const stride = this.width * 4 + 1;
    const raw = Buffer.alloc(stride * this.height);
    for (let y = 0; y < this.height; y += 1) {
      const rowStart = y * stride;
      raw[rowStart] = 0;
      this.pixels.copy(raw, rowStart + 1, y * this.width * 4, (y + 1) * this.width * 4);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND')
    ]);
  }
}

function insideRoundedRect(px, py, x, y, width, height, radius) {
  if (px < x || py < y || px > x + width || py > y + height) return false;
  const cx = px < x + radius ? x + radius : px > x + width - radius ? x + width - radius : px;
  const cy = py < y + radius ? y + radius : py > y + height - radius ? y + height - radius : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function glyphFor(character) {
  return FONT[character] || FONT[String(character).toUpperCase()] || FONT['?'];
}

function printable(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .toUpperCase();
}

function measureText(text, scale) {
  return printable(text)
    .split('')
    .reduce((width, character) => width + (glyphFor(character)[0].length + 1) * scale, 0);
}

function fitText(text, maxWidth, scale) {
  const value = printable(text);
  if (measureText(value, scale) <= maxWidth) return value;
  let next = value;
  while (next.length > 0 && measureText(`${next}...`, scale) > maxWidth) {
    next = next.slice(0, -1);
  }
  return next ? `${next}...` : '';
}

function formatNumber(value) {
  const number = Math.max(0, Number(value || 0));
  if (number >= 1000000) return `${trimDecimal(number / 1000000)}M`;
  if (number >= 1000) return `${trimDecimal(number / 1000)}K`;
  return String(Math.round(number));
}

function trimDecimal(value) {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
}

function progressMetrics(progress) {
  const current = Math.max(0, Number(progress.currentXp || 0));
  const needed = Math.max(1, Number(progress.neededXp || 1));
  return {
    current,
    needed,
    ratio: Math.max(0, Math.min(1, current / needed))
  };
}

function initialsFor(name) {
  const parts = printable(name).split(/[^A-Z0-9]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || 'U').slice(0, 2);
  return initials || 'U';
}

function drawAvatar(canvas, x, y, radius, name) {
  canvas.fillCircle(x + 5, y + 7, radius, COLORS.shadow);
  canvas.fillCircle(x, y, radius, COLORS.avatar);
  canvas.fillCircle(x, y, radius - 7, [139, 151, 165, 255]);
  const initials = initialsFor(name);
  const scale = initials.length > 1 ? 8 : 10;
  const width = measureText(initials, scale);
  canvas.drawText(initials, x - width / 2, y - 24, scale, COLORS.white);
}

function drawStatTile(canvas, x, y, width, height, label, value, accent = COLORS.cyan) {
  canvas.fillRoundedRect(x, y, width, height, 16, COLORS.panel);
  canvas.fillRect(x, y, 7, height, accent);
  canvas.drawText(label, x + 24, y + 18, 3, COLORS.muted, { maxWidth: width - 48 });
  canvas.drawText(value, x + 24, y + 48, 5, COLORS.white, { maxWidth: width - 48 });
}

function drawProgressBar(canvas, x, y, width, height, ratio) {
  canvas.fillRoundedRect(x, y, width, height, height / 2, COLORS.white);
  const fillWidth = Math.max(height, Math.round(width * ratio));
  canvas.fillRoundedRect(x, y, Math.min(width, fillWidth), height, height / 2, COLORS.red);
}

function createAchievementCard(data) {
  const canvas = new Raster(1100, 300);
  const clip = (x, y) => insideRoundedRect(x, y, 0, 0, 1100, 300, 10);
  canvas.fillRoundedRect(0, 0, 1100, 300, 10, COLORS.darkAlt);
  canvas.fillPolygon([[0, 0], [360, 0], [220, 300], [0, 300]], COLORS.red, clip);
  canvas.fillPolygon([[830, 0], [1100, 0], [1100, 300], [970, 300]], COLORS.cyan, clip);
  canvas.fillRoundedRect(40, 42, 200, 216, 18, COLORS.panel);
  canvas.fillPolygon([[140, 70], [205, 108], [205, 184], [140, 222], [75, 184], [75, 108]], [255, 199, 96, 255]);
  canvas.fillPolygon([[140, 92], [184, 118], [184, 172], [140, 198], [96, 172], [96, 118]], [255, 228, 120, 255]);
  canvas.drawText('XP', 110, 134, 8, [102, 70, 20, 255], { maxWidth: 90 });

  const count = Number(data.count || 1);
  const username = data.username || 'Member';
  const name = data.name || 'Achievement';
  const description = data.description || 'Unlocked a new milestone';
  canvas.drawText('ACHIEVEMENT UNLOCKED', 300, 50, 5, COLORS.muted, { maxWidth: 620 });
  canvas.fillRect(300, 96, 310, 5, COLORS.red);
  canvas.drawText(name, 300, 126, 6, COLORS.white, { maxWidth: 620 });
  canvas.drawText(description, 300, 196, 3, COLORS.muted, { maxWidth: 680 });
  canvas.drawText(`@${username}`, 300, 242, 3, COLORS.white, { maxWidth: 500 });
  if (count > 1) {
    canvas.fillRoundedRect(880, 190, 150, 58, 14, COLORS.panel);
    canvas.drawText(`+${formatNumber(count - 1)} MORE`, 902, 212, 3, COLORS.white, { maxWidth: 116 });
  }

  return canvas.toPng();
}

function createLevelCard(data) {
  const canvas = new Raster(1100, 300);
  const clip = (x, y) => insideRoundedRect(x, y, 0, 0, 1100, 300, 8);
  canvas.fillRoundedRect(0, 0, 1100, 300, 8, COLORS.dark);
  canvas.fillPolygon([[850, 0], [1100, 0], [1100, 300], [990, 300]], COLORS.cyan, clip);

  drawAvatar(canvas, 105, 105, 82, data.username);
  canvas.drawText(`@${data.username}`, 230, 58, 7, COLORS.white, { maxWidth: 460 });
  canvas.fillRect(230, 126, 270, 5, COLORS.red);

  const progress = progressMetrics(data);
  const level = formatNumber(data.level);
  const xp = `${formatNumber(progress.current)}/${formatNumber(progress.needed)}`;
  const rank = data.rank ? formatNumber(data.rank) : 'N/A';
  canvas.drawText(`LEVEL:${level}  XP:${xp}  RANK:${rank}`, 230, 164, 4, COLORS.white, { maxWidth: 780 });
  drawProgressBar(canvas, 42, 222, 860, 50, progress.ratio);

  return canvas.toPng();
}

function createProfileCard(data) {
  const canvas = new Raster(1100, 560);
  const clip = (x, y) => insideRoundedRect(x, y, 0, 0, 1100, 560, 12);
  canvas.fillRoundedRect(0, 0, 1100, 560, 12, COLORS.darkAlt);
  canvas.fillPolygon([[780, 0], [1100, 0], [1100, 220], [940, 220]], COLORS.cyan, clip);
  canvas.fillRect(0, 0, 18, 560, COLORS.red);
  canvas.fillRect(18, 0, 8, 560, COLORS.cyan);

  drawAvatar(canvas, 130, 130, 82, data.username);
  canvas.drawText(`@${data.username}`, 250, 70, 6, COLORS.white, { maxWidth: 500 });
  canvas.fillRect(250, 130, 310, 5, COLORS.red);
  canvas.drawText(`SERVER PROFILE`, 250, 160, 4, COLORS.muted, { maxWidth: 360 });

  const progress = progressMetrics(data);
  drawProgressBar(canvas, 250, 215, 620, 34, progress.ratio);
  canvas.drawText(`${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP TO NEXT`, 250, 260, 3, COLORS.white, { maxWidth: 620 });

  const achievements = Number(data.achievements || 0);
  drawStatTile(canvas, 58, 320, 310, 86, 'LEVEL', formatNumber(data.level), COLORS.red);
  drawStatTile(canvas, 395, 320, 310, 86, 'RANK', data.rank ? `#${formatNumber(data.rank)}` : 'N/A', COLORS.cyan);
  drawStatTile(canvas, 732, 320, 310, 86, 'MESSAGES SENT', formatNumber(data.messages), COLORS.red);
  drawStatTile(canvas, 58, 432, 310, 86, 'COINS', formatNumber(data.coins), COLORS.cyan);
  drawStatTile(canvas, 395, 432, 310, 86, 'DAILY STREAK', formatNumber(data.dailyStreak), COLORS.red);
  drawStatTile(canvas, 732, 432, 310, 86, 'ACHIEVEMENTS', formatNumber(achievements), COLORS.cyan);

  return canvas.toPng();
}

module.exports = {
  createAchievementCard,
  createLevelCard,
  createProfileCard
};
