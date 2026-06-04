const RESPONSE_STATE_KEY = 'dashboard_component_responses';

function responseKey(customId, value = null) {
  return value === null || value === undefined ? String(customId || '') : `${customId}:${value}`;
}

function responseMap(db, guildId) {
  const stored = db.getState(guildId, RESPONSE_STATE_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function normalizeResponse(input) {
  if (!input || typeof input !== 'object') return null;
  const content = String(input.response || input.responseMessage || input.message || '').trim().slice(0, 1900);
  if (!content) return null;
  return {
    content,
    ephemeral: input.ephemeral !== false
  };
}

function saveDashboardControlResponses(db, guildId, body) {
  const map = responseMap(db, guildId);
  const buttons = Array.isArray(body.buttons) ? body.buttons : [];
  const selects = Array.isArray(body.selects) ? body.selects : [];

  for (const button of buttons) {
    const customId = button.customId || button.custom_id;
    if (!customId) continue;
    const key = responseKey(customId);
    const response = normalizeResponse(button);
    if (response) map[key] = response;
    else delete map[key];
  }

  for (const select of selects) {
    const customId = select.customId || select.custom_id;
    if (!customId || !Array.isArray(select.options)) continue;
    for (const option of select.options) {
      if (!option.value) continue;
      const key = responseKey(customId, option.value);
      const response = normalizeResponse(option);
      if (response) map[key] = response;
      else delete map[key];
    }
  }

  db.setState(guildId, RESPONSE_STATE_KEY, map);
}

async function handleDashboardControlInteraction(db, interaction) {
  if (!interaction.guild) return false;
  const map = responseMap(db, interaction.guild.id);

  if (interaction.isButton?.()) {
    const response = map[responseKey(interaction.customId)] || {
      content: 'Action received.',
      ephemeral: true
    };
    await interaction.reply({
      content: response.content,
      ephemeral: response.ephemeral !== false,
      allowedMentions: { parse: [], users: [], roles: [] }
    });
    return true;
  }

  if (interaction.isStringSelectMenu?.()) {
    const responses = (interaction.values || [])
      .map((value) => map[responseKey(interaction.customId, value)])
      .filter(Boolean);
    const response = responses.length
      ? {
          content: responses.map((item) => item.content).join('\n\n').slice(0, 1900),
          ephemeral: responses.every((item) => item.ephemeral !== false)
        }
      : {
          content: 'Selection received.',
          ephemeral: true
        };
    await interaction.reply({
      content: response.content,
      ephemeral: response.ephemeral,
      allowedMentions: { parse: [], users: [], roles: [] }
    });
    return true;
  }

  return false;
}

module.exports = {
  saveDashboardControlResponses,
  handleDashboardControlInteraction
};
