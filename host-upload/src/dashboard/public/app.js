const dashboardBaseUrl = new URL('.', document.currentScript?.src || window.location.href);

const state = {
  session: null,
  overview: null,
  selectedGuildId: null,
  guildDetail: null,
  view: 'overview',
  picker: null,
  refreshTimer: null,
  toastTimer: null
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  init().catch((err) => {
    showLogin();
    showToast(err.message || 'Dashboard failed to load.');
  });
});

function bindElements() {
  Object.assign(els, {
    loginView: document.getElementById('loginView'),
    appView: document.getElementById('appView'),
    loginForm: document.getElementById('loginForm'),
    loginMessage: document.getElementById('loginMessage'),
    passwordInput: document.getElementById('passwordInput'),
    botAvatar: document.getElementById('botAvatar'),
    botTag: document.getElementById('botTag'),
    botMeta: document.getElementById('botMeta'),
    guildSearch: document.getElementById('guildSearch'),
    guildList: document.getElementById('guildList'),
    logoutButton: document.getElementById('logoutButton'),
    refreshButton: document.getElementById('refreshButton'),
    errorBanner: document.getElementById('errorBanner'),
    summaryLine: document.getElementById('summaryLine'),
    statGrid: document.getElementById('statGrid'),
    runtimeStamp: document.getElementById('runtimeStamp'),
    runtimeControls: document.getElementById('runtimeControls'),
    presenceForm: document.getElementById('presenceForm'),
    statusSelect: document.getElementById('statusSelect'),
    activityTypeSelect: document.getElementById('activityTypeSelect'),
    activityTextInput: document.getElementById('activityTextInput'),
    commandUsage: document.getElementById('commandUsage'),
    botBans: document.getElementById('botBans'),
    serverHeader: document.getElementById('serverHeader'),
    serverActionBar: document.getElementById('serverActionBar'),
    configForm: document.getElementById('configForm'),
    configKeySelect: document.getElementById('configKeySelect'),
    configValueInput: document.getElementById('configValueInput'),
    configPickerButton: document.getElementById('configPickerButton'),
    configTable: document.getElementById('configTable'),
    restrictionList: document.getElementById('restrictionList'),
    caseList: document.getElementById('caseList'),
    ticketList: document.getElementById('ticketList'),
    scheduledList: document.getElementById('scheduledList'),
    broadcastForm: document.getElementById('broadcastForm'),
    broadcastTarget: document.getElementById('broadcastTarget'),
    broadcastMessage: document.getElementById('broadcastMessage'),
    broadcastResult: document.getElementById('broadcastResult'),
    blacklistForm: document.getElementById('blacklistForm'),
    blacklistAction: document.getElementById('blacklistAction'),
    blacklistKind: document.getElementById('blacklistKind'),
    blacklistId: document.getElementById('blacklistId'),
    blacklistReason: document.getElementById('blacklistReason'),
    backupButton: document.getElementById('backupButton'),
    backupResult: document.getElementById('backupResult'),
    ownerHealth: document.getElementById('ownerHealth'),
    ownerServerList: document.getElementById('ownerServerList'),
    databasePath: document.getElementById('databasePath'),
    databaseTables: document.getElementById('databaseTables'),
    serverMatrix: document.getElementById('serverMatrix'),
    pickerOverlay: document.getElementById('pickerOverlay'),
    pickerTitle: document.getElementById('pickerTitle'),
    pickerCloseButton: document.getElementById('pickerCloseButton'),
    pickerSearch: document.getElementById('pickerSearch'),
    pickerList: document.getElementById('pickerList'),
    pickerClearButton: document.getElementById('pickerClearButton'),
    pickerCancelButton: document.getElementById('pickerCancelButton'),
    pickerApplyButton: document.getElementById('pickerApplyButton'),
    toast: document.getElementById('toast')
  });
}

function bindEvents() {
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.loginMessage.textContent = '';
    try {
      const password = els.passwordInput.value;
      state.session = await request('/api/login', { method: 'POST', body: { password }, allowUnauthenticated: true });
      els.passwordInput.value = '';
      showApp();
      try {
        await loadOverview();
      } catch (err) {
        renderDashboardError(err);
      }
    } catch (err) {
      showLogin();
      els.loginMessage.textContent = err.message || 'Sign in failed.';
    }
  });

  els.logoutButton.addEventListener('click', async () => {
    await request('/api/logout', { method: 'POST', allowUnauthenticated: true }).catch(() => null);
    state.session = { authenticated: false, passwordRequired: true };
    showLogin();
  });

  els.refreshButton.addEventListener('click', async () => {
    try {
      await refreshCurrentView();
      showToast('Dashboard refreshed.');
    } catch (err) {
      renderDashboardError(err);
      showToast(err.message || 'Dashboard refresh failed.');
    }
  });

  els.guildSearch.addEventListener('input', () => renderGuildList());

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  els.presenceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      status: els.statusSelect.value,
      activityType: els.activityTypeSelect.value,
      activityText: els.activityTextInput.value
    };
    const response = await request('/api/presence', { method: 'POST', body: payload });
    if (state.overview) state.overview.bot = response.bot;
    renderBot(response.bot);
    showToast('Presence updated.');
  });

  els.configKeySelect.addEventListener('change', syncConfigEditor);
  els.configPickerButton.addEventListener('click', openConfigPicker);

  els.configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedGuildId) return;
    const key = els.configKeySelect.value;
    const value = els.configValueInput.value;
    const detail = await request(`/api/guilds/${encodeURIComponent(state.selectedGuildId)}/config`, {
      method: 'POST',
      body: { key, value }
    });
    state.guildDetail = detail;
    renderGuildDetail(detail);
    await loadOverview(false);
    showToast('Setting saved.');
  });

  els.broadcastForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await request('/api/owner/broadcast', {
      method: 'POST',
      body: {
        target: els.broadcastTarget.value,
        message: els.broadcastMessage.value
      }
    });
    els.broadcastResult.textContent = `${response.sent}/${response.total} sent`;
    els.broadcastMessage.value = '';
    showToast('Broadcast sent.');
  });

  els.blacklistForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await request('/api/owner/blacklist', {
      method: 'POST',
      body: {
        action: els.blacklistAction.value,
        kind: els.blacklistKind.value,
        id: els.blacklistId.value,
        reason: els.blacklistReason.value
      }
    });
    if (state.overview) state.overview.botBans = response.botBans;
    renderBotBans(response.botBans);
    els.blacklistId.value = '';
    els.blacklistReason.value = '';
    showToast('Blacklist updated.');
    await loadOverview(false);
  });

  els.backupButton.addEventListener('click', async () => {
    els.backupButton.disabled = true;
    try {
      const response = await request('/api/owner/backup', { method: 'POST' });
      els.backupResult.textContent = response.filePath || 'Backup created';
      if (response.database) renderDatabase(response.database);
      showToast('Database backup created.');
    } finally {
      els.backupButton.disabled = false;
    }
  });

  els.pickerCloseButton.addEventListener('click', closePicker);
  els.pickerCancelButton.addEventListener('click', closePicker);
  els.pickerOverlay.addEventListener('click', (event) => {
    if (event.target === els.pickerOverlay) closePicker();
  });
  els.pickerSearch.addEventListener('input', renderPickerList);
  els.pickerClearButton.addEventListener('click', () => {
    if (!state.picker) return;
    state.picker.selected.clear();
    renderPickerList();
  });
  els.pickerApplyButton.addEventListener('click', applyPickerSelection);
}

async function init() {
  state.session = await request('/api/session', { allowUnauthenticated: true });
  if (!state.session.authenticated && state.session.passwordRequired) {
    showLogin();
    return;
  }

  showApp();
  if (state.session.bot) renderBot(state.session.bot);
  try {
    await loadOverview();
  } catch (err) {
    renderDashboardError(err);
  }
  state.refreshTimer = window.setInterval(() => {
    refreshCurrentView(false).catch(() => null);
  }, 15000);
}

async function refreshCurrentView(withGuild = true) {
  await loadOverview(false);
  if (withGuild && state.view === 'server' && state.selectedGuildId) {
    await loadGuild(state.selectedGuildId);
  }
}

async function loadOverview(resetGuild = true) {
  const overview = await request('/api/overview');
  state.overview = overview;
  if (resetGuild && !state.selectedGuildId && overview.guilds.length) {
    state.selectedGuildId = overview.guilds[0].id;
  }
  renderOverview(overview);
}

async function loadGuild(guildId) {
  if (!guildId) return;
  const detail = await request(`/api/guilds/${encodeURIComponent(guildId)}`);
  state.selectedGuildId = guildId;
  state.guildDetail = detail;
  renderGuildList();
  renderGuildDetail(detail);
}

function renderOverview(overview) {
  renderErrors(overview.errors || []);
  renderBot(overview.bot);
  renderGuildList();
  renderStats(overview);
  renderRuntimeControls(overview.runtime);
  renderPresenceForm(overview.bot);
  renderCommandUsage(overview.commandUsage);
  renderBotBans(overview.botBans);
  renderDatabase(overview.database);
  renderServerMatrix(overview.guilds);
  renderOwnerControls(overview);

  els.summaryLine.textContent = `${formatNumber(overview.totals.guilds)} servers - ${formatNumber(overview.totals.members)} members - ${statusLabel(overview.bot.status)} - ${formatDuration(overview.bot.uptimeMs)} uptime`;
  els.runtimeStamp.textContent = formatDate(overview.generatedAt);
}

function renderBot(bot) {
  els.botTag.textContent = bot.tag || 'Discord Bot';
  els.botMeta.textContent = `${statusLabel(bot.status)} - ${formatDuration(bot.uptimeMs)} uptime`;

  if (bot.avatarUrl) {
    els.botAvatar.innerHTML = `<img src="${escapeAttribute(bot.avatarUrl)}" alt="">`;
  } else {
    els.botAvatar.textContent = initials(bot.tag || 'BD');
  }
}

function renderStats(overview) {
  const cards = [
    ['Servers', formatNumber(overview.totals.guilds), `${formatNumber(overview.totals.channels)} channels`],
    ['Members', formatNumber(overview.totals.members), `${formatNumber(overview.totals.roles)} roles cached`],
    ['Database Rows', formatNumber(overview.database.totalRows), `${Object.keys(overview.database.tables).length} tables`],
    ['Gateway', overview.bot.ping === null ? 'N/A' : `${overview.bot.ping} ms`, statusLabel(overview.bot.status)]
  ];

  els.statGrid.innerHTML = cards.map(([label, value, detail]) => `
    <article class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join('');
}

function renderRuntimeControls(runtime) {
  const flags = [
    ['maintenance', 'Maintenance', 'Owner commands only'],
    ['panicMode', 'Panic mode', 'All runtime locks'],
    ['botLocked', 'Bot lock', 'Moderation and tickets'],
    ['aiLocked', 'AI lock', 'AI replies and helpers']
  ];

  els.runtimeControls.innerHTML = flags.map(([key, label, detail]) => `
    <label class="switch-row">
      <span>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      <input type="checkbox" data-runtime-flag="${escapeAttribute(key)}" ${runtime[key] ? 'checked' : ''}>
    </label>
  `).join('');

  els.runtimeControls.querySelectorAll('[data-runtime-flag]').forEach((input) => {
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        const response = await request('/api/runtime', {
          method: 'POST',
          body: { flag: input.dataset.runtimeFlag, enabled: input.checked }
        });
        if (state.overview) {
          state.overview.runtime = response.runtime;
          state.overview.bot = response.bot;
        }
        renderRuntimeControls(response.runtime);
        renderBot(response.bot);
        showToast('Runtime updated.');
      } catch (err) {
        input.checked = !input.checked;
        showToast(err.message || 'Runtime update failed.');
      } finally {
        input.disabled = false;
      }
    });
  });
}

function renderPresenceForm(bot) {
  const status = ['online', 'idle', 'dnd', 'invisible'].includes(bot.status) ? bot.status : 'online';
  els.statusSelect.value = status;
  if (bot.activityType && [...els.activityTypeSelect.options].some((option) => option.value === bot.activityType)) {
    els.activityTypeSelect.value = bot.activityType;
  }
  if (bot.activityText !== undefined) {
    els.activityTextInput.value = bot.activityText || '';
  }
}

function renderGuildList() {
  if (!state.overview) return;
  const query = els.guildSearch.value.trim().toLowerCase();
  const guilds = state.overview.guilds.filter((guild) => guild.name.toLowerCase().includes(query) || guild.id.includes(query));

  els.guildList.innerHTML = guilds.map((guild) => {
    const health = guild.missingCritical.length === 0 ? 'Ready' : `${guild.missingCritical.length} missing`;
    const pillClass = guild.missingCritical.length === 0 ? '' : guild.missingCritical.length > 2 ? ' danger' : ' warn';
    const active = guild.id === state.selectedGuildId ? ' is-active' : '';
    return `
      <button class="guild-item${active}" type="button" data-guild-id="${escapeAttribute(guild.id)}">
        <strong>${escapeHtml(guild.name)}</strong>
        <span class="pill${pillClass}">${escapeHtml(health)}</span>
        <small>${formatNumber(guild.memberCount)} members</small>
      </button>
    `;
  }).join('') || '<div class="empty-state">No servers found.</div>';

  els.guildList.querySelectorAll('[data-guild-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadGuild(button.dataset.guildId);
      setView('server');
    });
  });
}

function renderGuildDetail(detail) {
  renderErrors(detail.errors || []);
  const guild = detail.guild;
  const health = guild.missingCritical.length
    ? `${guild.missingCritical.length} critical settings missing`
    : 'Critical settings ready';
  const pillClass = guild.missingCritical.length ? (guild.missingCritical.length > 2 ? ' danger' : ' warn') : '';

  els.serverHeader.innerHTML = `
    <div>
      <h2>${escapeHtml(guild.name)}</h2>
      <p>${formatNumber(guild.memberCount)} members - ${formatNumber(guild.channelCount)} channels - ${formatNumber(guild.roleCount)} roles</p>
    </div>
    <span class="pill${pillClass}">${escapeHtml(health)}</span>
  `;

  renderConfig(detail.config);
  renderServerActions(guild);
  renderRestrictions(detail.activeRestrictions);
  renderCases(detail.recentCases);
  renderTickets(detail.ticketPanels, detail.tickets);
  renderScheduled(detail);
}

function renderConfig(config) {
  const editable = config.filter((row) => row.editable);
  const previousKey = els.configKeySelect.value;
  els.configKeySelect.innerHTML = editable.map((row) => `
    <option value="${escapeAttribute(row.key)}">${escapeHtml(row.label)}</option>
  `).join('');
  if (editable.some((row) => row.key === previousKey)) els.configKeySelect.value = previousKey;
  syncConfigEditor();

  els.configTable.innerHTML = config.map((row) => `
    <tr class="${row.critical && row.empty ? 'config-risk' : ''}">
      <td>
        <strong>${escapeHtml(row.label)}</strong><br>
        <span class="muted">${escapeHtml(row.key)} - ${escapeHtml(typeLabel(row.type))}</span>
      </td>
      <td>
        <div class="config-cell">
          <span>${escapeHtml(row.display)}</span>
          ${row.picker ? `<button class="secondary-button compact" type="button" data-config-pick="${escapeAttribute(row.key)}">Pick</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  els.configTable.querySelectorAll('[data-config-pick]').forEach((button) => {
    button.addEventListener('click', () => {
      els.configKeySelect.value = button.dataset.configPick;
      syncConfigEditor();
      openConfigPicker();
    });
  });
}

function syncConfigEditor() {
  if (!state.guildDetail) return;
  const row = state.guildDetail.config.find((item) => item.key === els.configKeySelect.value);
  if (!row) {
    els.configValueInput.value = '';
    els.configPickerButton.disabled = true;
    return;
  }
  els.configValueInput.value = configInputValue(row.value);
  els.configPickerButton.disabled = !row.picker;
  els.configPickerButton.textContent = row.picker ? 'Pick' : 'Manual';
}

function typeLabel(type) {
  const labels = {
    channel: 'channel',
    role: 'role',
    'role-list': 'roles',
    'user-list': 'users',
    style: 'style',
    boolean: 'toggle',
    number: 'number',
    json: 'json',
    message: 'message',
    text: 'text'
  };
  return labels[type] || type || 'value';
}

function configInputValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function renderServerActions(guild) {
  els.serverActionBar.innerHTML = `
    <div class="action-group">
      <button class="secondary-button" type="button" data-guild-action="lockdown">Lockdown</button>
      <button class="secondary-button" type="button" data-guild-action="unlockdown">Unlockdown</button>
    </div>
    <div class="danger-group">
      <input id="leaveConfirmInput" type="text" placeholder="${escapeAttribute(guild.id)}">
      <button id="leaveGuildButton" class="danger-button" type="button">Leave Server</button>
    </div>
  `;

  els.serverActionBar.querySelectorAll('[data-guild-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await request(`/api/guilds/${encodeURIComponent(guild.id)}/action`, {
          method: 'POST',
          body: { action: button.dataset.guildAction }
        });
        if (response.detail) {
          state.guildDetail = response.detail;
          renderGuildDetail(response.detail);
        }
        showToast(`${button.dataset.guildAction} updated ${response.updatedChannels || 0} channels.`);
      } finally {
        button.disabled = false;
      }
    });
  });

  const leaveButton = els.serverActionBar.querySelector('#leaveGuildButton');
  const leaveInput = els.serverActionBar.querySelector('#leaveConfirmInput');
  leaveButton.addEventListener('click', async () => {
    leaveButton.disabled = true;
    try {
      const response = await request(`/api/guilds/${encodeURIComponent(guild.id)}/leave`, {
        method: 'POST',
        body: { confirm: leaveInput.value }
      });
      state.selectedGuildId = null;
      state.guildDetail = null;
      state.overview = response.overview;
      renderOverview(response.overview);
      setView('overview');
      showToast(`Left ${response.left.name}.`);
    } finally {
      leaveButton.disabled = false;
    }
  });
}

function renderOwnerControls(overview) {
  const previousTarget = els.broadcastTarget.value;
  els.broadcastTarget.innerHTML = [
    '<option value="all">All servers</option>',
    ...overview.guilds.map((guild) => `<option value="${escapeAttribute(guild.id)}">${escapeHtml(guild.name)}</option>`)
  ].join('');
  if ([...els.broadcastTarget.options].some((option) => option.value === previousTarget)) {
    els.broadcastTarget.value = previousTarget;
  }

  const owner = overview.owner || {};
  const health = owner.health || {};
  els.ownerHealth.innerHTML = [
    ['Ready Servers', health.configuredServers ?? 0],
    ['Needs Setup', health.needsSetup ?? 0],
    ['Cases', health.cases ?? 0],
    ['Tickets', health.tickets ?? 0],
    ['Tracked Members', health.trackedMembers ?? 0],
    ['Achievements', health.achievements ?? 0]
  ].map(([label, value]) => `
    <div class="mini-card">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `).join('');

  els.ownerServerList.innerHTML = listHtml(overview.guilds, 'No servers connected.', (guild) => {
    const stateText = guild.missingCritical.length ? `${guild.missingCritical.length} missing` : 'Ready';
    return `
      <div class="owner-server-row">
        <div>
          <strong>${escapeHtml(guild.name)}</strong>
          <span>${formatNumber(guild.memberCount)} members - ${escapeHtml(stateText)}</span>
        </div>
        <button class="secondary-button compact" type="button" data-owner-open="${escapeAttribute(guild.id)}">Open</button>
      </div>
    `;
  });

  els.ownerServerList.querySelectorAll('[data-owner-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadGuild(button.dataset.ownerOpen);
      setView('server');
    });
  });
}

function openConfigPicker() {
  if (!state.guildDetail) return;
  const row = state.guildDetail.config.find((item) => item.key === els.configKeySelect.value);
  if (!row?.picker) return;
  const options = state.guildDetail.options?.[row.picker] || [];
  const selected = new Set(listConfigInputValues(row.value));
  state.picker = { row, options, selected };
  els.pickerTitle.textContent = row.label;
  els.pickerSearch.value = '';
  renderPickerList();
  els.pickerOverlay.classList.remove('is-hidden');
  els.pickerSearch.focus();
}

function closePicker() {
  state.picker = null;
  els.pickerOverlay.classList.add('is-hidden');
}

function renderPickerList() {
  if (!state.picker) return;
  const query = els.pickerSearch.value.trim().toLowerCase();
  const filtered = state.picker.options.filter((item) => {
    const haystack = `${item.label || ''} ${item.detail || ''} ${item.id || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  els.pickerList.innerHTML = filtered.map((item) => {
    const selected = state.picker.selected.has(item.id) ? ' is-selected' : '';
    const color = item.color ? `<span class="swatch" style="background:${escapeAttribute(item.color)}"></span>` : '<span class="swatch muted-swatch"></span>';
    const avatar = item.avatarUrl ? `<img src="${escapeAttribute(item.avatarUrl)}" alt="">` : color;
    return `
      <button class="picker-option${selected}" type="button" data-picker-id="${escapeAttribute(item.id)}">
        ${avatar}
        <span>
          <strong>${escapeHtml(item.label || item.id)}</strong>
          <small>${escapeHtml(item.detail || item.id)}</small>
        </span>
      </button>
    `;
  }).join('') || '<div class="empty-state">No matches.</div>';

  els.pickerList.querySelectorAll('[data-picker-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.pickerId;
      if (state.picker.row.multiple) {
        if (state.picker.selected.has(id)) state.picker.selected.delete(id);
        else state.picker.selected.add(id);
      } else {
        state.picker.selected.clear();
        state.picker.selected.add(id);
      }
      renderPickerList();
    });
  });
}

function applyPickerSelection() {
  if (!state.picker) return;
  const values = [...state.picker.selected];
  els.configValueInput.value = state.picker.row.multiple ? values.join(', ') : (values[0] || '');
  closePicker();
}

function listConfigInputValues(value) {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function renderRestrictions(items) {
  els.restrictionList.innerHTML = listHtml(items, 'No active restrictions.', (item) => `
    <div class="data-row">
      <strong>${escapeHtml(item.userLabel)}</strong>
      <span>${escapeHtml(item.reason || 'No reason')} - ${escapeHtml(item.source || 'manual')}</span>
      <small>${item.expiresAt ? `Expires ${formatDate(item.expiresAt)}` : 'No expiry'} - ${item.originalRoleCount} saved roles</small>
    </div>
  `);
}

function renderCases(items) {
  els.caseList.innerHTML = listHtml(items, 'No cases recorded.', (item) => `
    <div class="data-row">
      <strong>#${escapeHtml(item.caseId)} ${escapeHtml(item.type)}</strong>
      <span>${escapeHtml(item.targetLabel)} - ${escapeHtml(item.reason || 'No reason')}</span>
      <small>${formatDate(item.createdAt)} by ${escapeHtml(item.moderatorLabel)}</small>
    </div>
  `);
}

function renderTickets(panels, tickets) {
  const rows = [
    ...panels.map((panel) => ({ kind: 'Panel', title: panel.name, meta: panel.supportRole, detail: panel.description || panel.panelId })),
    ...tickets.map((ticket) => ({ kind: ticket.status, title: ticket.userLabel, meta: ticket.channelLabel, detail: formatDate(ticket.openedAt) }))
  ];

  els.ticketList.innerHTML = listHtml(rows, 'No tickets or panels.', (item) => `
    <div class="data-row">
      <strong>${escapeHtml(item.kind)} - ${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.meta || 'No metadata')}</span>
      <small>${escapeHtml(item.detail || '')}</small>
    </div>
  `);
}

function renderScheduled(detail) {
  const rows = [
    ...detail.reminders.map((item) => ({
      title: `Reminder - ${item.userLabel}`,
      detail: item.message,
      meta: `Due ${formatDate(item.dueAt)} in ${item.channelLabel}`
    })),
    ...detail.giveaways.map((item) => ({
      title: `Giveaway - ${item.prize}`,
      detail: `${item.winnerCount} winner${item.winnerCount === 1 ? '' : 's'}`,
      meta: `${item.ended ? 'Ended' : 'Ends'} ${formatDate(item.endsAt)} in ${item.channelLabel}`
    })),
    {
      title: 'Counting',
      detail: `Current number ${detail.state.countingNumber || 0}`,
      meta: detail.state.countingLastUser ? `Last user ${detail.state.countingLastUser}` : 'No last user'
    },
    {
      title: 'Update snapshots',
      detail: `Roblox ${detail.state.robloxSnapshotSaved ? 'saved' : 'empty'} - Executor ${detail.state.executorSnapshotSaved ? 'saved' : 'empty'}`,
      meta: 'Watcher state'
    },
    {
      title: 'Top Level',
      detail: detail.progression?.topXp?.[0]
        ? `${detail.progression.topXp[0].userLabel} - level ${detail.progression.topXp[0].level}`
        : 'No XP tracked',
      meta: 'Leveling'
    },
    {
      title: 'Top Balance',
      detail: detail.progression?.topBalance?.[0]
        ? `${detail.progression.topBalance[0].userLabel} - ${formatNumber(detail.progression.topBalance[0].balance)} coins`
        : 'No coins tracked',
      meta: 'Economy'
    }
  ];

  els.scheduledList.innerHTML = listHtml(rows, 'No scheduled state.', (item) => `
    <div class="data-row">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
      <small>${escapeHtml(item.meta)}</small>
    </div>
  `);
}

function renderCommandUsage(items) {
  els.commandUsage.innerHTML = listHtml(items, 'No command usage recorded.', (item) => `
    <div class="data-row">
      <strong>${escapeHtml(item.source)}:${escapeHtml(item.command_name)}</strong>
      <span>${formatNumber(item.count)} uses</span>
      <small>Last used ${formatDate(item.last_used_at)}</small>
    </div>
  `);
}

function renderBotBans(items) {
  els.botBans.innerHTML = listHtml(items, 'No watchlist entries.', (item) => `
    <div class="data-row">
      <strong>${escapeHtml(item.kind)} ${escapeHtml(item.id)}</strong>
      <span>${escapeHtml(item.reason || 'No reason')}</span>
      <small>${formatDate(item.created_at)}</small>
    </div>
  `);
}

function renderDatabase(database) {
  els.databasePath.textContent = database.filePath || '';
  const entries = Object.entries(database.tables).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  els.databaseTables.innerHTML = entries.map(([table, count]) => `
    <div class="bar-row">
      <span title="${escapeAttribute(table)}">${escapeHtml(table)}</span>
      <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(4, Math.round((count / max) * 100))}%"></div></div>
      <strong>${formatNumber(count)}</strong>
    </div>
  `).join('');
}

function renderServerMatrix(guilds) {
  els.serverMatrix.innerHTML = listHtml(guilds, 'No servers connected.', (guild) => {
    const missing = guild.missingCritical.length ? guild.missingCritical.join(', ') : 'Critical settings ready';
    return `
      <div class="data-row">
        <strong>${escapeHtml(guild.name)}</strong>
        <span>${formatNumber(guild.memberCount)} members - ${escapeHtml(guild.embedStyle)} style</span>
        <small>${escapeHtml(missing)}</small>
      </div>
    `;
  });
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('is-hidden', section.id !== `${view}View`);
  });
  if (view === 'server' && state.selectedGuildId && !state.guildDetail) {
    loadGuild(state.selectedGuildId).catch((err) => showToast(err.message));
  }
}

function showLogin() {
  els.appView.classList.add('is-hidden');
  els.loginView.classList.remove('is-hidden');
  window.clearInterval(state.refreshTimer);
  els.passwordInput.focus();
}

function showApp() {
  els.loginView.classList.add('is-hidden');
  els.appView.classList.remove('is-hidden');
}

function renderDashboardError(err) {
  const message = err.message || 'Dashboard data failed to load.';
  renderErrors([{ section: 'Dashboard', message }]);
  els.summaryLine.textContent = 'Dashboard data failed to load';
  els.statGrid.innerHTML = `<div class="empty-state full-width">${escapeHtml(message)}</div>`;
  els.runtimeStamp.textContent = '';
  els.runtimeControls.innerHTML = '<div class="empty-state full-width">Runtime data unavailable.</div>';
  els.commandUsage.innerHTML = '<div class="empty-state">Command usage unavailable.</div>';
  els.botBans.innerHTML = '<div class="empty-state">Watchlist unavailable.</div>';
  els.guildList.innerHTML = '<div class="empty-state">Server data unavailable.</div>';
  els.databasePath.textContent = '';
  els.databaseTables.innerHTML = '<div class="empty-state">Database data unavailable.</div>';
  els.serverMatrix.innerHTML = '<div class="empty-state">Server data unavailable.</div>';
}

function renderErrors(errors) {
  if (!errors || errors.length === 0) {
    els.errorBanner.classList.add('is-hidden');
    els.errorBanner.textContent = '';
    return;
  }

  els.errorBanner.innerHTML = errors.slice(0, 5).map((error) => `
    <div>
      <strong>${escapeHtml(error.section || 'Dashboard')}</strong>
      <span>${escapeHtml(error.message || 'Data could not be loaded.')}</span>
    </div>
  `).join('');
  els.errorBanner.classList.remove('is-hidden');
}

async function request(path, options = {}) {
  const fetchOptions = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {}
  };

  if (options.body !== undefined) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(dashboardUrl(path), fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !options.allowUnauthenticated) {
      showLogin();
    }
    throw new Error(data.error || response.statusText);
  }

  return data;
}

function dashboardUrl(path) {
  return new URL(String(path).replace(/^\/+/, ''), dashboardBaseUrl);
}

function listHtml(items, emptyText, renderItem) {
  if (!items || items.length === 0) return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  return items.map(renderItem).join('');
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('is-hidden');
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.add('is-hidden');
  }, 2800);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(Number(value)));
}

function statusLabel(status) {
  const labels = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'DND',
    invisible: 'Invisible',
    unknown: 'Unknown'
  };
  return labels[status] || status || 'Unknown';
}

function initials(text) {
  return String(text || 'BD')
    .split(/\s|#/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'BD';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
