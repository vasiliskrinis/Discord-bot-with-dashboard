const RESPONSE_STATE_KEY = 'dashboard_component_responses';
const DEFAULT_BUTTON_RESPONSE = 'Action received.';
const DEFAULT_SELECT_RESPONSE = 'Selection received.';

function responseKey(customId, value = null) {
  return value === null || value === undefined ? String(customId || '') : `${customId}:${value}`;
}

function responseMap(db, guildId) {
  const stored = db.getState(guildId, RESPONSE_STATE_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function normalizeResponse(input, fallbackContent, fallbackEphemeral = true) {
  if (!input || typeof input !== 'object') return null;
  const content = String(input.response || input.responseMessage || input.message || fallbackContent || '').trim().slice(0, 1900);
  if (!content) return null;
  return {
    content,
    ephemeral: input.ephemeral === undefined ? fallbackEphemeral !== false : input.ephemeral !== false
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
    const response = normalizeResponse(button, DEFAULT_BUTTON_RESPONSE);
    if (response) map[key] = response;
    else delete map[key];
  }

  for (const select of selects) {
    const customId = select.customId || select.custom_id;
    if (!customId || !Array.isArray(select.options)) continue;
    const selectResponse = normalizeResponse(select, DEFAULT_SELECT_RESPONSE);
    for (const option of select.options) {
      if (!option.value) continue;
      const key = responseKey(customId, option.value);
      const response = normalizeResponse(option, selectResponse?.content || DEFAULT_SELECT_RESPONSE, selectResponse?.ephemeral ?? true);
      if (response) map[key] = response;
      else delete map[key];
    }
  }

  db.setState(guildId, RESPONSE_STATE_KEY, map);
}

function hasDashboardControlResponse(db, interaction) {
  if (!interaction.guild || !interaction.customId) return false;
  const map = responseMap(db, interaction.guild.id);

  if (interaction.isButton?.()) {
    return Object.prototype.hasOwnProperty.call(map, responseKey(interaction.customId));
  }

  if (interaction.isStringSelectMenu?.()) {
    return (interaction.values || []).some((value) => (
      Object.prototype.hasOwnProperty.call(map, responseKey(interaction.customId, value))
    ));
  }

  return false;
}

async function handleDashboardControlInteraction(db, interaction) {
  if (!interaction.guild) return false;
  const map = responseMap(db, interaction.guild.id);

  if (interaction.isButton?.()) {
    const response = map[responseKey(interaction.customId)] || {
      content: DEFAULT_BUTTON_RESPONSE,
      ephemeral: true
    };
    await replyOnce(interaction, {
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
          content: DEFAULT_SELECT_RESPONSE,
          ephemeral: true
        };
    await replyOnce(interaction, {
      content: response.content,
      ephemeral: response.ephemeral,
      allowedMentions: { parse: [], users: [], roles: [] }
    });
    return true;
  }

  return false;
}

async function replyOnce(interaction, payload) {
  if (!interaction.isRepliable?.() || interaction.replied) return false;
  if (interaction.deferred) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
    return true;
  }
  await interaction.reply(payload);
  return true;
}

module.exports = {
  saveDashboardControlResponses,
  hasDashboardControlResponse,
  handleDashboardControlInteraction
};
