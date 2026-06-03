const dashboardBaseUrl = new URL('.', document.currentScript?.src || window.location.href);

const state = {
  session: null,
  overview: null,
  selectedGuildId: null,
  guildDetail: null,
  view: 'overview',
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
    configForm: document.getElementById('configForm'),
    configKeySelect: document.getElementById('configKeySelect'),
    configValueInput: document.getElementById('configValueInput'),
    configTable: document.getElementById('configTable'),
    restrictionList: document.getElementById('restrictionList'),
    caseList: document.getElementById('caseList'),
    ticketList: document.getElementById('ticketList'),
    scheduledList: document.getElementById('scheduledList'),
    databasePath: document.getElementById('databasePath'),
    databaseTables: document.getElementById('databaseTables'),
    serverMatrix: document.getElementById('serverMatrix'),
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
    <tr>
      <td>
        <strong>${escapeHtml(row.label)}</strong><br>
        <span class="muted">${escapeHtml(row.key)}</span>
      </td>
      <td>${escapeHtml(row.display)}</td>
    </tr>
  `).join('');
}

function syncConfigEditor() {
  if (!state.guildDetail) return;
  const row = state.guildDetail.config.find((item) => item.key === els.configKeySelect.value);
  if (!row) {
    els.configValueInput.value = '';
    return;
  }
  els.configValueInput.value = configInputValue(row.value);
}

function configInputValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
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
