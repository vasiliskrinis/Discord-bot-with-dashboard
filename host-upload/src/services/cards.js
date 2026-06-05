function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clampText(value, max = 42) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function svgShell(width, height, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    '<linearGradient id="redGlow" x1="0" x2="1"><stop offset="0" stop-color="#ff163d"/><stop offset="0.55" stop-color="#a10020"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>',
    '<linearGradient id="darkPanel" x1="0" x2="1"><stop offset="0" stop-color="#12131d"/><stop offset="1" stop-color="#20222b"/></linearGradient>',
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity=".45"/></filter>',
    '<pattern id="chevrons" width="160" height="120" patternUnits="userSpaceOnUse"><path d="M0 55 L60 0 L120 55 L60 110 Z" fill="#ffffff" opacity=".035"/><path d="M80 55 L140 0 L200 55 L140 110 Z" fill="#ff2148" opacity=".05"/></pattern>',
    '</defs>',
    body,
    '</svg>'
  ].join('');
}

function achievementCard(data = {}) {
  const title = escapeXml(clampText(data.title || 'Achievement Unlocked', 48));
  const name = escapeXml(clampText(data.name || 'Achievement', 38));
  const description = escapeXml(clampText(data.description || 'Unlocked a new milestone', 60));
  const rarity = escapeXml(String(data.rarity || 'RARE').toUpperCase().slice(0, 16));
  return svgShell(1100, 300, `
    <rect width="1100" height="300" rx="28" fill="#090a10"/>
    <circle cx="115" cy="155" r="185" fill="#9b2cff" opacity=".32"/>
    <circle cx="165" cy="185" r="155" fill="#ff1f83" opacity=".28"/>
    <rect x="18" y="18" width="1064" height="264" rx="24" fill="url(#darkPanel)" stroke="#c66a45" stroke-width="5" filter="url(#shadow)"/>
    <rect x="18" y="18" width="1064" height="264" rx="24" fill="url(#chevrons)"/>
    <polygon points="165,58 238,100 238,184 165,226 92,184 92,100" fill="#ffd099" stroke="#8b342a" stroke-width="5"/>
    <polygon points="165,74 222,107 222,174 165,207 108,174 108,107" fill="#ffc17f" opacity=".9"/>
    <path d="M129 156 C150 139 175 139 196 156 L196 176 C172 165 149 165 129 176 Z" fill="#81302c"/>
    <path d="M165 107 L174 122 L191 126 L179 139 L181 157 L165 149 L149 157 L151 139 L139 126 L156 122 Z" fill="#8b342a"/>
    <rect x="120" y="205" width="90" height="31" rx="15" fill="#ffe65a" stroke="#c89622" stroke-width="4"/>
    <text x="165" y="226" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#8b6a00">${rarity}</text>
    <text x="310" y="82" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="#ffb26b">${title}</text>
    <text x="310" y="130" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#f7f7ff">${name}</text>
    <text x="310" y="220" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#a9adbf">${description}</text>
    <path d="M24 262 C160 274 260 244 420 264 S680 282 850 260 S1010 248 1080 264" stroke="#ff8a3d" stroke-width="2" opacity=".5" fill="none"/>
  `);
}

function levelCard(data = {}) {
  const user = escapeXml(clampText(data.username || 'Member', 28));
  const level = escapeXml(String(data.level || 1));
  const startLevel = escapeXml(String(data.previousLevel || Math.max(0, Number(data.level || 1) - 1)));
  return svgShell(760, 230, `
    <rect width="760" height="230" rx="26" fill="#2c3137"/>
    <rect x="10" y="10" width="740" height="210" rx="22" fill="#313941"/>
    <circle cx="112" cy="115" r="72" fill="url(#redGlow)"/>
    <circle cx="112" cy="115" r="64" fill="#f1a0b7"/>
    <text x="112" y="129" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#2f2229">${escapeXml(initials(user))}</text>
    <text x="210" y="88" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="900" fill="#ffffff">Level-up!</text>
    <text x="210" y="152" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" fill="#ffffff">${startLevel} &#8226; ${level}</text>
    <text x="210" y="193" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#b9c0c9">${user}</text>
  `);
}

function welcomeCard(data = {}) {
  const user = escapeXml(clampText(data.username || 'new member', 34));
  const memberCount = escapeXml(String(data.memberCount || '?'));
  return svgShell(1100, 500, `
    <rect width="1100" height="500" fill="#050506"/>
    <rect width="1100" height="500" fill="url(#chevrons)" opacity="1"/>
    <g opacity=".55">
      <path d="M70 85 L170 20 L135 118 L250 80 L145 165 Z" fill="#f0f0f0"/>
      <path d="M845 40 L1000 0 L925 110 L1070 95 L885 190 Z" fill="#e5e5e5"/>
      <path d="M430 20 L530 0 L480 85 L600 60 L455 150 Z" fill="#ff123c"/>
      <path d="M680 315 L780 265 L735 380 L910 350 L710 455 Z" fill="#ff123c"/>
      <path d="M95 350 L235 315 L190 470 L325 430 L135 510 Z" fill="#f0f0f0"/>
    </g>
    <rect x="70" y="338" width="960" height="135" rx="8" fill="#000" opacity=".58"/>
    <circle cx="550" cy="175" r="112" fill="#5865f2" stroke="#ffffff" stroke-width="8"/>
    <path d="M495 152 C520 136 580 136 605 152 C613 177 609 199 592 211 C571 203 529 203 508 211 C491 199 487 177 495 152 Z" fill="#fff"/>
    <circle cx="527" cy="172" r="14" fill="#5865f2"/>
    <circle cx="573" cy="172" r="14" fill="#5865f2"/>
    <text x="550" y="385" text-anchor="middle" font-family="Arial Black, Impact, Arial, sans-serif" font-size="52" font-weight="900" fill="#ffffff">${user} just joined the server</text>
    <text x="550" y="438" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="900" fill="#d3c2c8">Member #${memberCount}</text>
  `);
}

module.exports = {
  achievementCard,
  levelCard,
  welcomeCard
};
