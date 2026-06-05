const dashboardBaseUrl = new URL('.', document.currentScript?.src || window.location.href);

const state = {
  session: null,
  overview: null,
  selectedGuildId: null,
  guildDetail: null,
  view: 'overview',
  selectedCommandCategory: 'all',
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
    commandSummary: document.getElementById('commandSummary'),
    commandStats: document.getElementById('commandStats'),
    commandCategoryList: document.getElementById('commandCategoryList'),
    commandCategoryTitle: document.getElementById('commandCategoryTitle'),
    commandCategoryMeta: document.getElementById('commandCategoryMeta'),
    commandCatalog: document.getElementById('commandCatalog'),
    commandUsage: document.getElementById('commandUsage'),
    botBans: document.getElementById('botBans'),
    serverHeader: document.getElementById('serverHeader'),
    serverActionBar: document.getElementById('serverActionBar'),
    serverControlStatus: document.getElementById('serverControlStatus'),
    channelCreateForm: document.getElementById('channelCreateForm'),
    channelCreateTypeSelect: document.getElementById('channelCreateTypeSelect'),
    channelCreateNameInput: document.getElementById('channelCreateNameInput'),
    channelCreateCategorySelect: document.getElementById('channelCreateCategorySelect'),
    channelCreateTopicInput: document.getElementById('channelCreateTopicInput'),
    channelCreateSlowmodeInput: document.getElementById('channelCreateSlowmodeInput'),
    channelManageForm: document.getElementById('channelManageForm'),
    channelManageSelect: document.getElementById('channelManageSelect'),
    channelManageNameInput: document.getElementById('channelManageNameInput'),
    channelManageCategorySelect: document.getElementById('channelManageCategorySelect'),
    channelManageTopicInput: document.getElementById('channelManageTopicInput'),
    channelManageSlowmodeInput: document.getElementById('channelManageSlowmodeInput'),
    channelManageLockSelect: document.getElementById('channelManageLockSelect'),
    channelRenameButton: document.getElementById('channelRenameButton'),
    channelUpdateButton: document.getElementById('channelUpdateButton'),
    channelDeleteButton: document.getElementById('channelDeleteButton'),
    categoryCreateForm: document.getElementById('categoryCreateForm'),
    categoryCreateNameInput: document.getElementById('categoryCreateNameInput'),
    categoryManageForm: document.getElementById('categoryManageForm'),
    categoryManageSelect: document.getElementById('categoryManageSelect'),
    categoryManageNameInput: document.getElementById('categoryManageNameInput'),
    categoryRenameButton: document.getElementById('categoryRenameButton'),
    categoryDeleteButton: document.getElementById('categoryDeleteButton'),
    roleCreateForm: document.getElementById('roleCreateForm'),
    roleCreateNameInput: document.getElementById('roleCreateNameInput'),
    roleCreateColorInput: document.getElementById('roleCreateColorInput'),
    roleCreateHoistInput: document.getElementById('roleCreateHoistInput'),
    roleCreateMentionableInput: document.getElementById('roleCreateMentionableInput'),
    roleManageForm: document.getElementById('roleManageForm'),
    roleManageSelect: document.getElementById('roleManageSelect'),
    roleManageNameInput: document.getElementById('roleManageNameInput'),
    roleRenameButton: document.getElementById('roleRenameButton'),
    roleDeleteButton: document.getElementById('roleDeleteButton'),
    serverRenameForm: document.getElementById('serverRenameForm'),
    serverNameInput: document.getElementById('serverNameInput'),
    ticketsHeader: document.getElementById('ticketsHeader'),
    ticketStats: document.getElementById('ticketStats'),
    embedForm: document.getElementById('embedForm'),
    embedChannelSelect: document.getElementById('embedChannelSelect'),
    embedContentInput: document.getElementById('embedContentInput'),
    embedTitleInput: document.getElementById('embedTitleInput'),
    embedColorInput: document.getElementById('embedColorInput'),
    embedDescriptionInput: document.getElementById('embedDescriptionInput'),
    embedThumbnailInput: document.getElementById('embedThumbnailInput'),
    embedImageInput: document.getElementById('embedImageInput'),
    embedAuthorInput: document.getElementById('embedAuthorInput'),
    embedFooterInput: document.getElementById('embedFooterInput'),
    embedFieldList: document.getElementById('embedFieldList'),
    embedButtonList: document.getElementById('embedButtonList'),
    embedSelectList: document.getElementById('embedSelectList'),
    embedJsonInput: document.getElementById('embedJsonInput'),
    embedUseJsonInput: document.getElementById('embedUseJsonInput'),
    embedPreviewChannel: document.getElementById('embedPreviewChannel'),
    embedPreviewStatus: document.getElementById('embedPreviewStatus'),
    embedPreviewCanvas: document.getElementById('embedPreviewCanvas'),
    addEmbedFieldButton: document.getElementById('addEmbedFieldButton'),
    addEmbedButtonButton: document.getElementById('addEmbedButtonButton'),
    addEmbedSelectButton: document.getElementById('addEmbedSelectButton'),
    syncEmbedJsonButton: document.getElementById('syncEmbedJsonButton'),
    applyEmbedJsonButton: document.getElementById('applyEmbedJsonButton'),
    embedResult: document.getElementById('embedResult'),
    configForm: document.getElementById('configForm'),
    configKeySelect: document.getElementById('configKeySelect'),
    configValueInput: document.getElementById('configValueInput'),
    configTextField: document.getElementById('configTextField'),
    configChoicePanel: document.getElementById('configChoicePanel'),
    configBooleanInput: document.getElementById('configBooleanInput'),
    configPickerButton: document.getElementById('configPickerButton'),
    configTable: document.getElementById('configTable'),
    ticketPanelForm: document.getElementById('ticketPanelForm'),
    ticketPanelStatus: document.getElementById('ticketPanelStatus'),
    ticketPanelNewButton: document.getElementById('ticketPanelNewButton'),
    ticketPanelList: document.getElementById('ticketPanelList'),
    ticketPanelIdInput: document.getElementById('ticketPanelIdInput'),
    ticketPanelNameInput: document.getElementById('ticketPanelNameInput'),
    ticketPanelModeInput: document.getElementById('ticketPanelModeInput'),
    ticketPanelChannelSelect: document.getElementById('ticketPanelChannelSelect'),
    ticketPanelCategorySelect: document.getElementById('ticketPanelCategorySelect'),
    ticketPanelRoleSelect: document.getElementById('ticketPanelRoleSelect'),
    ticketPanelButtonLabelInput: document.getElementById('ticketPanelButtonLabelInput'),
    ticketPanelButtonStyleSelect: document.getElementById('ticketPanelButtonStyleSelect'),
    ticketPanelDescriptionInput: document.getElementById('ticketPanelDescriptionInput'),
    ticketPanelContentInput: document.getElementById('ticketPanelContentInput'),
    ticketPanelOpenMessageInput: document.getElementById('ticketPanelOpenMessageInput'),
    ticketPanelCloseLabelInput: document.getElementById('ticketPanelCloseLabelInput'),
    ticketPanelDeleteLabelInput: document.getElementById('ticketPanelDeleteLabelInput'),
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
    backupImportInput: document.getElementById('backupImportInput'),
    backupImportButton: document.getElementById('backupImportButton'),
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

  els.commandCategoryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-command-category]');
    if (!button) return;
    state.selectedCommandCategory = button.dataset.commandCategory;
    renderCommandCatalog(state.overview?.commandCatalog || []);
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

  els.channelCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSelectedGuildAction({
      action: 'channel-create',
      channelType: els.channelCreateTypeSelect.value,
      name: els.channelCreateNameInput.value,
      parentId: els.channelCreateCategorySelect.value,
      topic: els.channelCreateTopicInput.value,
      slowmode: els.channelCreateSlowmodeInput.value
    }, {
      button: els.channelCreateForm.querySelector('button[type="submit"]'),
      onSuccess: () => {
        els.channelCreateNameInput.value = '';
        els.channelCreateTopicInput.value = '';
        els.channelCreateSlowmodeInput.value = '0';
      }
    });
  });

  els.categoryCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSelectedGuildAction({
      action: 'category-create',
      name: els.categoryCreateNameInput.value
    }, {
      button: els.categoryCreateForm.querySelector('button[type="submit"]'),
      onSuccess: () => {
        els.categoryCreateNameInput.value = '';
      }
    });
  });

  els.serverRenameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSelectedGuildAction({
      action: 'server-rename',
      name: els.serverNameInput.value
    }, { button: els.serverRenameForm.querySelector('button[type="submit"]') });
  });

  els.roleCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSelectedGuildAction({
      action: 'role-create',
      name: els.roleCreateNameInput.value,
      color: els.roleCreateColorInput.value,
      hoist: els.roleCreateHoistInput.checked,
      mentionable: els.roleCreateMentionableInput.checked
    }, {
      button: els.roleCreateForm.querySelector('button[type="submit"]'),
      onSuccess: () => {
        els.roleCreateNameInput.value = '';
        els.roleCreateHoistInput.checked = false;
        els.roleCreateMentionableInput.checked = false;
      }
    });
  });

  els.channelManageSelect.addEventListener('change', syncChannelManager);
  els.categoryManageSelect.addEventListener('change', syncCategoryManager);
  els.roleManageSelect.addEventListener('change', syncRoleManager);

  els.channelRenameButton.addEventListener('click', async () => {
    await runSelectedGuildAction({
      action: 'channel-rename',
      channelId: els.channelManageSelect.value,
      name: els.channelManageNameInput.value
    }, { button: els.channelRenameButton });
  });

  els.channelUpdateButton.addEventListener('click', async () => {
    await runSelectedGuildAction({
      action: 'channel-update',
      channelId: els.channelManageSelect.value,
      parentId: els.channelManageCategorySelect.value,
      topic: els.channelManageTopicInput.value,
      slowmode: els.channelManageSlowmodeInput.value,
      lockState: els.channelManageLockSelect.value
    }, { button: els.channelUpdateButton });
  });

  els.channelDeleteButton.addEventListener('click', async () => {
    const channel = selectedDashboardOption('channels', els.channelManageSelect.value);
    if (!channel || !window.confirm(`Delete #${channel.label}?`)) return;
    await runSelectedGuildAction({
      action: 'channel-delete',
      channelId: channel.id,
      confirm: channel.id
    }, { button: els.channelDeleteButton });
  });

  els.categoryRenameButton.addEventListener('click', async () => {
    await runSelectedGuildAction({
      action: 'category-rename',
      categoryId: els.categoryManageSelect.value,
      name: els.categoryManageNameInput.value
    }, { button: els.categoryRenameButton });
  });

  els.categoryDeleteButton.addEventListener('click', async () => {
    const category = selectedDashboardOption('categories', els.categoryManageSelect.value);
    if (!category || !window.confirm(`Delete category ${category.label}?`)) return;
    await runSelectedGuildAction({
      action: 'category-delete',
      categoryId: category.id,
      confirm: category.id
    }, { button: els.categoryDeleteButton });
  });

  els.roleRenameButton.addEventListener('click', async () => {
    await runSelectedGuildAction({
      action: 'role-rename',
      roleId: els.roleManageSelect.value,
      name: els.roleManageNameInput.value
    }, { button: els.roleRenameButton });
  });

  els.roleDeleteButton.addEventListener('click', async () => {
    const role = selectedDashboardOption('roles', els.roleManageSelect.value);
    if (!role || !window.confirm(`Delete @${role.label}?`)) return;
    await runSelectedGuildAction({
      action: 'role-delete',
      roleId: role.id,
      confirm: role.id
    }, { button: els.roleDeleteButton });
  });

  els.embedForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedGuildId) return;
    try {
      const payload = buildEmbedPayloadForSubmit();
      const response = await request(`/api/guilds/${encodeURIComponent(state.selectedGuildId)}/embed`, {
        method: 'POST',
        body: payload
      });
      els.embedResult.innerHTML = response.url ? `<a href="${escapeAttribute(response.url)}" target="_blank" rel="noreferrer">Message sent</a>` : 'Message sent';
      showToast('Custom embed sent.');
    } catch (err) {
      els.embedResult.textContent = err.message || 'Embed send failed.';
      showToast(err.message || 'Embed send failed.');
    }
  });

  els.embedForm.addEventListener('input', renderEmbedPreview);
  els.embedForm.addEventListener('change', renderEmbedPreview);

  els.addEmbedFieldButton.addEventListener('click', () => addEmbedFieldRow());
  els.addEmbedButtonButton.addEventListener('click', () => addEmbedButtonRow());
  els.addEmbedSelectButton.addEventListener('click', () => addEmbedSelectRow());
  els.syncEmbedJsonButton.addEventListener('click', () => {
    syncEmbedJsonFromForm();
    renderEmbedPreview();
    showToast('JSON updated from menu.');
  });
  els.applyEmbedJsonButton.addEventListener('click', () => {
    try {
      applyEmbedPayloadToForm(parseEmbedJsonPayload());
      renderEmbedPreview();
      showToast('JSON loaded into menu.');
    } catch (err) {
      showToast(err.message || 'Invalid embed JSON.');
    }
  });

  els.embedForm.addEventListener('click', (event) => {
    const removeTarget = event.target.closest('[data-builder-remove]');
    if (removeTarget) {
      removeTarget.closest('[data-builder-row]')?.remove();
      renderEmbedPreview();
      return;
    }

    const addOptionTarget = event.target.closest('[data-add-select-option]');
    if (addOptionTarget) {
      const selectRow = addOptionTarget.closest('.embed-select-row');
      addEmbedSelectOptionRow(selectRow?.querySelector('.embed-select-options'));
      renderEmbedPreview();
    }
  });

  els.configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedGuildId) return;
    const key = els.configKeySelect.value;
    const row = state.guildDetail?.config.find((item) => item.key === key);
    const value = row?.type === 'boolean' ? selectedBooleanConfigValue() : els.configValueInput.value;
    await saveConfigValue(key, value);
  });

  els.configBooleanInput.addEventListener('click', (event) => {
    const button = event.target.closest('[data-boolean-value]');
    if (!button) return;
    setBooleanControlValue(button.dataset.booleanValue === 'true');
  });

  els.ticketPanelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedGuildId) return;
    const submitButton = els.ticketPanelForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await request(`/api/guilds/${encodeURIComponent(state.selectedGuildId)}/tickets/panel`, {
        method: 'POST',
        body: ticketPanelPayload()
      });
      state.guildDetail = response.detail;
      renderGuildDetail(response.detail);
      showToast(`Ticket panel ${response.action}.`);
    } catch (err) {
      showToast(err.message || 'Ticket panel save failed.');
    } finally {
      submitButton.disabled = false;
    }
  });

  els.ticketPanelForm.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-ticket-mode]');
    if (modeButton) {
      setTicketMode(modeButton.dataset.ticketMode);
    }
  });

  els.ticketPanelNewButton.addEventListener('click', () => {
    fillTicketPanelForm(null);
    showToast('New ticket panel ready.');
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

  els.backupImportButton.addEventListener('click', async () => {
    const file = els.backupImportInput.files?.[0];
    if (!file) {
      showToast('Choose a backup file first.');
      return;
    }
    if (!window.confirm('Import this backup and replace the current dashboard database data?')) return;

    els.backupImportButton.disabled = true;
    try {
      const response = await uploadBackupFile(file);
      els.backupResult.textContent = `Imported ${formatNumber(response.importedRows || 0)} rows`;
      if (response.database) renderDatabase(response.database);
      await loadOverview(false);
      if (state.selectedGuildId) {
        await loadGuild(state.selectedGuildId).catch(() => null);
      }
      els.backupImportInput.value = '';
      showToast('Database backup imported.');
    } catch (err) {
      els.backupResult.textContent = err.message || 'Backup import failed.';
      showToast(err.message || 'Backup import failed.');
    } finally {
      els.backupImportButton.disabled = false;
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
  els.pickerApplyButton.addEventListener('click', () => {
    applyPickerSelection().catch((err) => {
      showToast(err.message || 'Could not save choice.');
    });
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
  if (withGuild && ['server', 'tickets'].includes(state.view) && state.selectedGuildId) {
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
  const previousGuildId = state.selectedGuildId;
  const detail = await request(`/api/guilds/${encodeURIComponent(guildId)}`);
  state.selectedGuildId = guildId;
  state.guildDetail = detail;
  if (previousGuildId !== guildId && els.ticketPanelIdInput) els.ticketPanelIdInput.value = '';
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
  renderCommandCatalog(overview.commandCatalog || []);
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

function renderCommandCatalog(commands) {
  if (!els.commandCatalog) return;
  const sections = commandSections(commands || []);
  const allCommands = sections.flatMap((section) => section.commands);
  if (!sections.some((section) => section.id === state.selectedCommandCategory)) {
    state.selectedCommandCategory = 'all';
  }

  const selected = state.selectedCommandCategory === 'all'
    ? null
    : sections.find((section) => section.id === state.selectedCommandCategory);
  const visibleSections = selected ? [selected] : sections;

  els.commandSummary.textContent = `${formatNumber(allCommands.length)} commands grouped by workflow.`;
  els.commandStats.innerHTML = [
    ['Categories', sections.length],
    ['Slash commands', allCommands.filter((command) => command.source !== 'owner').length],
    ['Owner tools', allCommands.filter((command) => command.source === 'owner').length],
    ['Subcommands', allCommands.reduce((sum, command) => sum + (command.subcommands?.length || 0), 0)]
  ].map(([label, value]) => `
    <div class="mini-card">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `).join('');

  els.commandCategoryList.innerHTML = [
    { id: 'all', label: 'All Commands', description: 'Every command category', commands: allCommands },
    ...sections
  ].map((section) => `
    <button class="command-category ${section.id === state.selectedCommandCategory ? 'is-active' : ''}" type="button" data-command-category="${escapeAttribute(section.id)}">
      <span>
        <strong>${escapeHtml(section.label)}</strong>
        <small>${escapeHtml(section.description || `${section.commands.length} commands`)}</small>
      </span>
      <b>${formatNumber(section.commands.length)}</b>
    </button>
  `).join('');

  els.commandCategoryTitle.textContent = selected ? selected.label : 'All Commands';
  els.commandCategoryMeta.textContent = selected
    ? `${formatNumber(selected.commands.length)} commands - ${selected.description}`
    : `${formatNumber(allCommands.length)} commands across ${formatNumber(sections.length)} categories`;

  els.commandCatalog.innerHTML = visibleSections.map((section) => `
    <article class="command-section">
      <div class="command-section-head">
        <span>${escapeHtml(section.label)}</span>
        <strong>${formatNumber(section.commands.length)}</strong>
      </div>
      <div class="command-grid">
        ${section.commands.map(commandCard).join('')}
      </div>
    </article>
  `).join('') || '<div class="empty-state">No commands registered.</div>';
}

function commandSections(commands) {
  const groups = [
    ['setup', 'Setup', 'Configuration, verification, server setup.', new Set(['setup', 'verification', 'channel-restriction', 'mass-sync-categories', 'qna'])],
    ['tickets', 'Tickets', 'Panel creation and support flow tools.', new Set(['ticket-panel'])],
    ['moderation', 'Moderation', 'Restriction, cases, warnings, bans.', new Set(['restrict', 'unrestrict', 'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'unwarn', 'warnings', 'softban', 'mass-ban', 'case', 'ban-list', 'note'])],
    ['channels', 'Channels & Roles', 'Permissions, cleanup, roles, voice tools.', new Set(['lock', 'unlock', 'lockdown', 'unlockdown', 'purge', 'slowmode', 'give-role', 'remove-role', 'voice-mute', 'lock-user', 'unlock-user', 'temp-role', 'temp-role-remove', 'temp-role-list', 'move', 'set-nick'])],
    ['community', 'Community & Utility', 'General server utilities and broadcasts.', new Set(['help', 'ping', 'afk', 'poll', 'dm', 'say', 'userinfo', 'snipe', 'first-message', 'remind', 'giveaway', 'bump', 'booster-role', 'steal-emoji', 'steal-sticker'])],
    ['ai', 'AI & Embeds', 'AI embed creation and Q&A workflows.', new Set(['embed-create'])],
    ['progress', 'Games & Progress', 'Games, economy, levels, pets.', new Set(['game', 'balance', 'daily', 'profile', 'level', 'leaderboard', 'role-level', 'pet'])]
  ];

  const byName = new Map(commands.map((command) => [command.name, command]));
  const sections = groups.map(([id, label, description, names]) => ({
    id,
    label,
    description,
    commands: [...names].map((name) => byName.get(name)).filter(Boolean)
  }));
  const known = new Set(groups.flatMap(([, , , names]) => [...names]));
  const extra = commands.filter((command) => !known.has(command.name));
  if (extra.length) sections.push({ id: 'other', label: 'Other', description: 'Additional registered commands.', commands: extra });
  return sections.filter((section) => section.commands.length);
}

function commandCard(command) {
  const usage = command.usage || `/${command.name}`;
  const subcommands = command.subcommands || [];
  const options = command.options || [];
  return `
    <button class="command-card" type="button" title="${escapeAttribute(command.description || command.name)}">
      <span class="command-source">${escapeHtml(command.source === 'owner' ? 'Owner' : 'Slash')}</span>
      <strong>${escapeHtml(usage)}</strong>
      <span>${escapeHtml(command.description || 'No description')}</span>
      ${subcommands.length ? `<small>${escapeHtml(subcommands.map((name) => `${usage} ${name}`).join('  '))}</small>` : ''}
      ${options.length ? `<em>${escapeHtml(options.slice(0, 6).join(', '))}</em>` : ''}
    </button>
  `;
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
      setView(state.view === 'tickets' ? 'tickets' : 'server');
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

  const headerHtml = `
    <div>
      <h2>${escapeHtml(guild.name)}</h2>
      <p>${formatNumber(guild.memberCount)} members - ${formatNumber(guild.channelCount)} channels - ${formatNumber(guild.roleCount)} roles</p>
    </div>
    <span class="pill${pillClass}">${escapeHtml(health)}</span>
  `;
  els.serverHeader.innerHTML = headerHtml;
  els.ticketsHeader.innerHTML = headerHtml;

  renderConfig(detail.config);
  renderTicketPanelForm(detail);
  renderTicketStats(detail);
  renderEmbedSender(detail);
  renderServerActions(guild);
  renderServerControlCenter(detail);
  renderRestrictions(detail.activeRestrictions);
  renderCases(detail.recentCases);
  renderTicketPanelList(detail.ticketPanels);
  renderTickets(detail.tickets);
  renderScheduled(detail);
}

function renderTicketPanelForm(detail) {
  const textChannels = detail.options?.textChannels || [];
  const categories = detail.options?.categories || [];
  const roles = detail.options?.roles || [];
  const activePanel = detail.ticketPanels?.[0] || null;

  fillSelect(els.ticketPanelChannelSelect, textChannels, 'Choose a text channel', true);
  fillSelect(els.ticketPanelCategorySelect, categories, 'No category', false);
  fillSelect(els.ticketPanelRoleSelect, roles, 'No support role', false);

  if (!els.ticketPanelIdInput.value && activePanel) {
    fillTicketPanelForm(activePanel);
  } else if (!activePanel) {
    fillTicketPanelForm(null);
  }

  els.ticketPanelStatus.textContent = `${formatNumber(detail.ticketPanels?.length || 0)} panels - ${formatNumber(detail.tickets?.filter((ticket) => ticket.status === 'open').length || 0)} open tickets`;
}

function renderTicketStats(detail) {
  const panels = detail.ticketPanels || [];
  const tickets = detail.tickets || [];
  const openTickets = tickets.filter((ticket) => ticket.status === 'open').length;
  const threadPanels = panels.filter((panel) => panel.mode !== 'channel').length;
  const channelPanels = panels.filter((panel) => panel.mode === 'channel').length;
  els.ticketStats.innerHTML = [
    ['Panels', panels.length, `${threadPanels} thread / ${channelPanels} channel`],
    ['Open Tickets', openTickets, `${Math.max(0, tickets.length - openTickets)} closed recent`],
    ['Support Roles', new Set(panels.map((panel) => panel.supportRoleId).filter(Boolean)).size, 'unique roles'],
    ['Posted Panels', panels.filter((panel) => panel.panelMessageId).length, 'messages tracked']
  ].map(([label, value, detailText]) => `
    <article class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
      <small>${escapeHtml(detailText)}</small>
    </article>
  `).join('');
}

function fillSelect(select, items, placeholder, required) {
  const previous = select.value;
  select.innerHTML = [
    required ? '' : `<option value="">${escapeHtml(placeholder)}</option>`,
    ...items.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</option>`)
  ].join('');
  if (items.some((item) => item.id === previous) || (!required && previous === '')) {
    select.value = previous;
  } else if (required && items[0]) {
    select.value = items[0].id;
  }
}

function fillTicketPanelForm(panel) {
  els.ticketPanelIdInput.value = panel?.panelId || '';
  els.ticketPanelNameInput.value = panel?.name || 'Support Tickets';
  setTicketMode(panel?.mode || 'thread');
  setSelectValue(els.ticketPanelChannelSelect, panel?.panelChannelId || '');
  setSelectValue(els.ticketPanelCategorySelect, panel?.categoryId || '');
  setSelectValue(els.ticketPanelRoleSelect, panel?.supportRoleId || '');
  els.ticketPanelButtonLabelInput.value = panel?.buttonLabel || 'Open Ticket';
  els.ticketPanelButtonStyleSelect.value = panel?.buttonStyle || 'primary';
  els.ticketPanelDescriptionInput.value = panel?.description || 'Open a ticket and the support team will help you.';
  els.ticketPanelContentInput.value = panel?.panelContent || '';
  els.ticketPanelOpenMessageInput.value = panel?.openMessage || '';
  els.ticketPanelCloseLabelInput.value = panel?.closeButtonLabel || 'Close Ticket';
  els.ticketPanelDeleteLabelInput.value = panel?.deleteButtonLabel || 'Delete Ticket';
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
  }
}

function setTicketMode(mode) {
  const normalized = mode === 'channel' ? 'channel' : 'thread';
  els.ticketPanelModeInput.value = normalized;
  els.ticketPanelForm.querySelectorAll('[data-ticket-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.ticketMode === normalized);
  });
}

function ticketPanelPayload() {
  return {
    panelId: els.ticketPanelIdInput.value,
    name: els.ticketPanelNameInput.value,
    mode: els.ticketPanelModeInput.value,
    panelChannelId: els.ticketPanelChannelSelect.value,
    categoryId: els.ticketPanelCategorySelect.value,
    supportRoleId: els.ticketPanelRoleSelect.value,
    buttonLabel: els.ticketPanelButtonLabelInput.value,
    buttonStyle: els.ticketPanelButtonStyleSelect.value,
    description: els.ticketPanelDescriptionInput.value,
    panelContent: els.ticketPanelContentInput.value,
    openMessage: els.ticketPanelOpenMessageInput.value,
    closeButtonLabel: els.ticketPanelCloseLabelInput.value,
    deleteButtonLabel: els.ticketPanelDeleteLabelInput.value
  };
}

function renderEmbedSender(detail) {
  const channels = detail.options?.textChannels || [];
  const previousChannel = els.embedChannelSelect.value;
  els.embedChannelSelect.innerHTML = channels.map((channel) => `
    <option value="${escapeAttribute(channel.id)}">${escapeHtml(channel.label)}</option>
  `).join('');
  if (channels.some((channel) => channel.id === previousChannel)) {
    els.embedChannelSelect.value = previousChannel;
  } else if (channels[0]) {
    els.embedChannelSelect.value = channels[0].id;
  }

  renderEmbedPreview();
}

function addEmbedFieldRow(field = {}) {
  const row = document.createElement('div');
  row.className = 'builder-row embed-field-row';
  row.dataset.builderRow = 'field';
  row.innerHTML = `
    <label>
      Name
      <input class="embed-field-name" type="text" maxlength="256" value="${escapeAttribute(field.name || '')}">
    </label>
    <label class="wide">
      Value
      <textarea class="embed-field-value" rows="2" maxlength="1024">${escapeHtml(field.value || '')}</textarea>
    </label>
    <label class="check-row">
      <input class="embed-field-inline" type="checkbox" ${field.inline ? 'checked' : ''}>
      Inline
    </label>
    <button class="secondary-button compact" type="button" data-builder-remove>Remove</button>
  `;
  els.embedFieldList.appendChild(row);
  renderEmbedPreview();
}

function addEmbedButtonRow(button = {}) {
  const row = document.createElement('div');
  row.className = 'builder-row embed-button-row';
  row.dataset.builderRow = 'button';
  row.innerHTML = `
    <label>
      Label
      <input class="embed-button-label" type="text" maxlength="80" placeholder="Button label" value="${escapeAttribute(button.label || '')}">
    </label>
    <label>
      Style
      <select class="embed-button-style">
        ${['primary', 'secondary', 'success', 'danger', 'link'].map((style) => `<option value="${style}" ${style === (button.style || 'secondary') ? 'selected' : ''}>${style}</option>`).join('')}
      </select>
    </label>
    <label>
      Emoji
      <input class="embed-button-emoji" type="text" maxlength="80" value="${escapeAttribute(button.emoji || '')}">
    </label>
    <label>
      Custom ID
      <input class="embed-button-custom-id" type="text" maxlength="100" value="${escapeAttribute(button.customId || `dashboard:button:${Date.now()}`)}">
    </label>
    <label>
      Link URL
      <input class="embed-button-url" type="url" maxlength="2048" value="${escapeAttribute(button.url || '')}">
    </label>
    <label class="check-row">
      <input class="embed-button-disabled" type="checkbox" ${button.disabled ? 'checked' : ''}>
      Disabled
    </label>
    <label class="wide">
      Response Message
      <textarea class="embed-button-response" rows="2" maxlength="1900">${escapeHtml(button.response || '')}</textarea>
    </label>
    <label class="check-row">
      <input class="embed-button-public" type="checkbox" ${button.ephemeral === false ? 'checked' : ''}>
      Public response
    </label>
    <button class="secondary-button compact" type="button" data-builder-remove>Remove</button>
  `;
  els.embedButtonList.appendChild(row);
  renderEmbedPreview();
}

function addEmbedSelectRow(select = {}) {
  const row = document.createElement('div');
  row.className = 'builder-row embed-select-row';
  row.dataset.builderRow = 'select';
  row.innerHTML = `
    <label>
      Placeholder
      <input class="embed-select-placeholder" type="text" maxlength="150" placeholder="Menu placeholder" value="${escapeAttribute(select.placeholder || '')}">
    </label>
    <label>
      Custom ID
      <input class="embed-select-custom-id" type="text" maxlength="100" value="${escapeAttribute(select.customId || `dashboard:select:${Date.now()}`)}">
    </label>
    <label>
      Min
      <input class="embed-select-min" type="number" min="0" max="25" value="${Number(select.minValues ?? 1)}">
    </label>
    <label>
      Max
      <input class="embed-select-max" type="number" min="1" max="25" value="${Number(select.maxValues ?? 1)}">
    </label>
    <button class="secondary-button compact" type="button" data-add-select-option>Add Option</button>
    <button class="secondary-button compact" type="button" data-builder-remove>Remove Menu</button>
    <div class="embed-select-options builder-list wide"></div>
  `;
  els.embedSelectList.appendChild(row);
  const optionList = row.querySelector('.embed-select-options');
  const options = select.options?.length ? select.options : [];
  options.forEach((option) => addEmbedSelectOptionRow(optionList, option));
  renderEmbedPreview();
}

function addEmbedSelectOptionRow(optionList, option = {}) {
  if (!optionList) return;
  const row = document.createElement('div');
  row.className = 'builder-row embed-select-option-row';
  row.dataset.builderRow = 'select-option';
  row.innerHTML = `
    <label>
      Label
      <input class="embed-option-label" type="text" maxlength="100" placeholder="Option label" value="${escapeAttribute(option.label || '')}">
    </label>
    <label>
      Value
      <input class="embed-option-value" type="text" maxlength="100" placeholder="option_value" value="${escapeAttribute(option.value || '')}">
    </label>
    <label>
      Description
      <input class="embed-option-description" type="text" maxlength="100" value="${escapeAttribute(option.description || '')}">
    </label>
    <label>
      Emoji
      <input class="embed-option-emoji" type="text" maxlength="80" value="${escapeAttribute(option.emoji || '')}">
    </label>
    <label class="check-row">
      <input class="embed-option-default" type="checkbox" ${option.default ? 'checked' : ''}>
      Default
    </label>
    <label class="wide">
      Response Message
      <textarea class="embed-option-response" rows="2" maxlength="1900">${escapeHtml(option.response || '')}</textarea>
    </label>
    <label class="check-row">
      <input class="embed-option-public" type="checkbox" ${option.ephemeral === false ? 'checked' : ''}>
      Public response
    </label>
    <button class="secondary-button compact" type="button" data-builder-remove>Remove</button>
  `;
  optionList.appendChild(row);
  renderEmbedPreview();
}

function renderEmbedPreview() {
  if (!els.embedPreviewCanvas) return;
  let payload;
  try {
    payload = buildEmbedPreviewPayload();
    els.embedPreviewStatus.textContent = els.embedUseJsonInput.checked ? 'JSON' : 'Live';
    els.embedPreviewStatus.classList.remove('is-error');
  } catch (err) {
    els.embedPreviewStatus.textContent = 'Invalid JSON';
    els.embedPreviewStatus.classList.add('is-error');
    els.embedPreviewChannel.textContent = selectedEmbedChannelLabel();
    els.embedPreviewCanvas.innerHTML = `
      <div class="embed-preview-empty">
        <strong>Preview paused</strong>
        <span>${escapeHtml(err.message || 'Invalid JSON payload.')}</span>
      </div>
    `;
    return;
  }

  const embed = firstEmbedFromPayload(payload);
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  const selects = Array.isArray(payload.selects) ? payload.selects : [];
  const hasEmbed = hasVisibleEmbedPreview(embed);
  const hasContent = Boolean(String(payload.content || '').trim());
  const hasComponents = buttons.length || selects.length;

  els.embedPreviewChannel.textContent = selectedEmbedChannelLabel(payload.channelId);

  if (!hasContent && !hasEmbed && !hasComponents) {
    els.embedPreviewCanvas.innerHTML = `
      <div class="embed-preview-empty">
        <strong>Nothing to preview</strong>
        <span>Draft is empty.</span>
      </div>
    `;
    return;
  }

  els.embedPreviewCanvas.innerHTML = `
    <div class="discord-message">
      <div class="discord-avatar">${escapeHtml(initials(els.botTag.textContent || 'BD'))}</div>
      <div class="discord-message-body">
        <div class="discord-message-head">
          <strong>${escapeHtml(els.botTag.textContent || 'Discord Bot')}</strong>
          <span>Today at ${escapeHtml(previewTime())}</span>
        </div>
        ${hasContent ? `<div class="discord-content">${escapeHtml(payload.content).replace(/\n/g, '<br>')}</div>` : ''}
        ${hasEmbed ? embedPreviewMarkup(embed) : ''}
        ${hasComponents ? componentPreviewMarkup(buttons, selects) : ''}
      </div>
    </div>
  `;
}

function buildEmbedPreviewPayload() {
  if (!els.embedUseJsonInput.checked) return buildEmbedPayloadFromForm();
  const payload = normalizeEmbedJsonPayload(parseEmbedJsonPayload());
  payload.channelId = payload.channelId || els.embedChannelSelect.value;
  return payload;
}

function selectedEmbedChannelLabel(channelId = els.embedChannelSelect.value) {
  const option = [...els.embedChannelSelect.options].find((item) => item.value === channelId) || els.embedChannelSelect.selectedOptions?.[0];
  return option?.textContent ? `#${option.textContent.trim().replace(/^#/, '')}` : 'No channel selected';
}

function hasVisibleEmbedPreview(embed) {
  if (!embed || typeof embed !== 'object') return false;
  return Boolean(
    embed.title ||
    embed.description ||
    urlValue(embed.thumbnail) ||
    urlValue(embed.image) ||
    embed.author?.name ||
    embed.footer?.text ||
    (Array.isArray(embed.fields) && embed.fields.some((field) => field.name || field.value))
  );
}

function embedPreviewMarkup(embed) {
  const color = previewEmbedColor(embed.color);
  const fields = Array.isArray(embed.fields) ? embed.fields.filter((field) => field.name || field.value) : [];
  const thumbnail = urlValue(embed.thumbnail);
  const image = urlValue(embed.image);
  const authorName = embed.author?.name || '';
  const footerText = embed.footer?.text || '';
  return `
    <article class="discord-embed" style="--embed-color:${escapeAttribute(color)}">
      <div class="discord-embed-main">
        ${authorName ? `<div class="discord-embed-author">${escapeHtml(authorName)}</div>` : ''}
        ${embed.title ? `<strong class="discord-embed-title">${escapeHtml(embed.title)}</strong>` : ''}
        ${embed.description ? `<div class="discord-embed-description">${escapeHtml(embed.description).replace(/\n/g, '<br>')}</div>` : ''}
        ${fields.length ? `
          <div class="discord-embed-fields">
            ${fields.map((field) => `
              <div class="discord-embed-field ${field.inline ? 'is-inline' : ''}">
                <strong>${escapeHtml(field.name || 'Field')}</strong>
                <span>${escapeHtml(field.value || '-').replace(/\n/g, '<br>')}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${isPreviewImageUrl(image) ? `<img class="discord-embed-image" src="${escapeAttribute(image)}" alt="">` : ''}
        ${footerText ? `<div class="discord-embed-footer">${escapeHtml(footerText)}</div>` : ''}
      </div>
      ${isPreviewImageUrl(thumbnail) ? `<img class="discord-embed-thumbnail" src="${escapeAttribute(thumbnail)}" alt="">` : ''}
    </article>
  `;
}

function componentPreviewMarkup(buttons, selects) {
  return `
    <div class="discord-components">
      ${buttons.length ? `
        <div class="discord-button-row">
          ${buttons.slice(0, 5).map((button) => `
            <button class="discord-button is-${escapeAttribute(buttonStyleFromDiscord(button.style))}" type="button" disabled>
              ${button.emoji ? `<span>${escapeHtml(button.emoji)}</span>` : ''}
              ${escapeHtml(button.label || 'Button')}
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${selects.map((select) => `
        <div class="discord-select-preview">
          <span>${escapeHtml(select.placeholder || 'Choose an option')}</span>
          <small>${formatNumber(Array.isArray(select.options) ? select.options.length : 0)} options</small>
        </div>
      `).join('')}
    </div>
  `;
}

function previewEmbedColor(value) {
  return colorInputValue(value) || '#5865f2';
}

function isPreviewImageUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function previewTime() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function buildEmbedPayloadFromForm() {
  return {
    channelId: els.embedChannelSelect.value,
    content: els.embedContentInput.value,
    embed: {
      title: els.embedTitleInput.value,
      description: els.embedDescriptionInput.value,
      color: els.embedColorInput.value,
      thumbnail: els.embedThumbnailInput.value,
      image: els.embedImageInput.value,
      author: { name: els.embedAuthorInput.value },
      footer: { text: els.embedFooterInput.value },
      fields: [...els.embedFieldList.querySelectorAll('.embed-field-row')]
        .map((row) => ({
          name: row.querySelector('.embed-field-name').value,
          value: row.querySelector('.embed-field-value').value,
          inline: row.querySelector('.embed-field-inline').checked
        }))
        .filter((field) => field.name || field.value)
    },
    buttons: [...els.embedButtonList.querySelectorAll('.embed-button-row')]
      .map((row) => ({
        label: row.querySelector('.embed-button-label').value,
        style: row.querySelector('.embed-button-style').value,
        emoji: row.querySelector('.embed-button-emoji').value,
        customId: row.querySelector('.embed-button-custom-id').value,
        url: row.querySelector('.embed-button-url').value,
        disabled: row.querySelector('.embed-button-disabled').checked,
        response: row.querySelector('.embed-button-response').value,
        ephemeral: !row.querySelector('.embed-button-public').checked
      }))
      .filter((button) => button.label),
    selects: [...els.embedSelectList.querySelectorAll('.embed-select-row')]
      .map((row) => ({
        placeholder: row.querySelector('.embed-select-placeholder').value,
        customId: row.querySelector('.embed-select-custom-id').value,
        minValues: Number(row.querySelector('.embed-select-min').value) || 1,
        maxValues: Number(row.querySelector('.embed-select-max').value) || 1,
        options: [...row.querySelectorAll('.embed-select-option-row')]
          .map((optionRow) => ({
            label: optionRow.querySelector('.embed-option-label').value,
            value: optionRow.querySelector('.embed-option-value').value,
            description: optionRow.querySelector('.embed-option-description').value,
            emoji: optionRow.querySelector('.embed-option-emoji').value,
            default: optionRow.querySelector('.embed-option-default').checked,
            response: optionRow.querySelector('.embed-option-response').value,
            ephemeral: !optionRow.querySelector('.embed-option-public').checked
          }))
          .filter((option) => option.label && option.value)
      }))
      .filter((select) => select.options.length)
  };
}

function buildEmbedPayloadForSubmit() {
  if (!els.embedUseJsonInput.checked) return buildEmbedPayloadFromForm();
  const payload = normalizeEmbedJsonPayload(parseEmbedJsonPayload());
  payload.rawJson = true;
  payload.channelId = payload.channelId || els.embedChannelSelect.value;
  return payload;
}

function parseEmbedJsonPayload() {
  const text = els.embedJsonInput.value.trim();
  if (!text) throw new Error('Paste a JSON payload first.');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Embed JSON must be an object.');
    }
    return parsed;
  } catch (err) {
    if (err.message === 'Embed JSON must be an object.') throw err;
    throw new Error('Invalid embed JSON. Check quotes, commas, and brackets.');
  }
}

function syncEmbedJsonFromForm() {
  els.embedJsonInput.value = JSON.stringify(buildEmbedPayloadFromForm(), null, 2);
}

function applyEmbedPayloadToForm(rawPayload) {
  const payload = normalizeEmbedJsonPayload(rawPayload);
  const embed = firstEmbedFromPayload(payload);
  const fields = Array.isArray(embed.fields) ? embed.fields : [];

  if (payload.channelId && [...els.embedChannelSelect.options].some((option) => option.value === payload.channelId)) {
    els.embedChannelSelect.value = payload.channelId;
  }
  els.embedContentInput.value = payload.content || '';
  els.embedTitleInput.value = embed.title || '';
  els.embedDescriptionInput.value = embed.description || '';
  els.embedColorInput.value = colorInputValue(embed.color) || '#5865f2';
  els.embedThumbnailInput.value = urlValue(embed.thumbnail);
  els.embedImageInput.value = urlValue(embed.image);
  els.embedAuthorInput.value = embed.author?.name || '';
  els.embedFooterInput.value = embed.footer?.text || '';

  els.embedFieldList.innerHTML = '';
  fields.forEach((field) => addEmbedFieldRow({
    name: field.name || '',
    value: field.value || '',
    inline: Boolean(field.inline)
  }));

  els.embedButtonList.innerHTML = '';
  (payload.buttons || []).forEach((button) => addEmbedButtonRow({
    label: button.label || '',
    style: buttonStyleFromDiscord(button.style),
    emoji: emojiValue(button.emoji),
    customId: button.customId || button.custom_id || '',
    url: button.url || '',
    disabled: Boolean(button.disabled),
    response: button.response || button.responseMessage || button.message || '',
    ephemeral: button.ephemeral !== false
  }));

  els.embedSelectList.innerHTML = '';
  (payload.selects || []).forEach((select) => addEmbedSelectRow({
    placeholder: select.placeholder || '',
    customId: select.customId || select.custom_id || '',
    minValues: select.minValues ?? select.min_values ?? 1,
    maxValues: select.maxValues ?? select.max_values ?? 1,
    options: Array.isArray(select.options) ? select.options.map((option) => ({
      label: option.label || '',
      value: option.value || '',
      description: option.description || '',
      emoji: emojiValue(option.emoji),
      default: Boolean(option.default),
      response: option.response || option.responseMessage || option.message || '',
      ephemeral: option.ephemeral !== false
    })) : []
  }));

  els.embedUseJsonInput.checked = false;
}

function normalizeEmbedJsonPayload(rawPayload) {
  const payload = { ...rawPayload };
  if (!payload.channelId && payload.channel_id) payload.channelId = String(payload.channel_id);
  if (!payload.embed && !Array.isArray(payload.embeds) && looksLikeEmbed(payload)) {
    payload.embed = { ...rawPayload };
  }
  if (!payload.embed && Array.isArray(payload.embeds)) {
    payload.embed = payload.embeds[0] || {};
  }
  if (Array.isArray(payload.components) && (!Array.isArray(payload.buttons) || !Array.isArray(payload.selects))) {
    const friendly = componentsToFriendlyControls(payload.components);
    if (!Array.isArray(payload.buttons)) payload.buttons = friendly.buttons;
    if (!Array.isArray(payload.selects)) payload.selects = friendly.selects;
  }
  payload.buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  payload.selects = Array.isArray(payload.selects) ? payload.selects : [];
  return payload;
}

function firstEmbedFromPayload(payload) {
  if (payload.embed && typeof payload.embed === 'object') return payload.embed;
  if (Array.isArray(payload.embeds) && payload.embeds[0] && typeof payload.embeds[0] === 'object') return payload.embeds[0];
  return {};
}

function looksLikeEmbed(value) {
  return ['title', 'description', 'color', 'thumbnail', 'image', 'author', 'footer', 'fields', 'timestamp', 'url']
    .some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function componentsToFriendlyControls(components) {
  const buttons = [];
  const selects = [];
  components.forEach((row) => {
    const rowComponents = Array.isArray(row?.components) ? row.components : [row].filter(Boolean);
    rowComponents.forEach((component) => {
      if (component.type === 2 || component.label || component.url) {
        buttons.push({
          label: component.label || 'Button',
          style: buttonStyleFromDiscord(component.style),
          emoji: emojiValue(component.emoji),
          customId: component.custom_id || component.customId || '',
          url: component.url || '',
          disabled: Boolean(component.disabled),
          response: component.response || component.responseMessage || component.message || '',
          ephemeral: component.ephemeral !== false
        });
        return;
      }
      if (component.type === 3 || Array.isArray(component.options)) {
        selects.push({
          placeholder: component.placeholder || '',
          customId: component.custom_id || component.customId || '',
          minValues: component.min_values ?? component.minValues ?? 1,
          maxValues: component.max_values ?? component.maxValues ?? 1,
          options: Array.isArray(component.options) ? component.options.map((option) => ({
            label: option.label || '',
            value: option.value || '',
            description: option.description || '',
            emoji: emojiValue(option.emoji),
            default: Boolean(option.default),
            response: option.response || option.responseMessage || option.message || '',
            ephemeral: option.ephemeral !== false
          })) : []
        });
      }
    });
  });
  return { buttons, selects };
}

function buttonStyleFromDiscord(style) {
  const styles = {
    1: 'primary',
    2: 'secondary',
    3: 'success',
    4: 'danger',
    5: 'link',
    primary: 'primary',
    secondary: 'secondary',
    success: 'success',
    danger: 'danger',
    link: 'link'
  };
  return styles[String(style || '').toLowerCase()] || 'secondary';
}

function emojiValue(emoji) {
  if (!emoji) return '';
  if (typeof emoji === 'string') return emoji;
  if (emoji.id) return emoji.name ? `${emoji.name}:${emoji.id}` : emoji.id;
  return emoji.name || '';
}

function urlValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.url || '';
}

function colorInputValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`;
  }
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^0x[0-9a-f]{6}$/i.test(text)) return `#${text.slice(2)}`;
  if (/^[0-9]+$/.test(text)) return `#${Math.max(0, Math.min(0xffffff, Number.parseInt(text, 10))).toString(16).padStart(6, '0')}`;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return '';
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
        <span class="muted">${escapeHtml(typeLabel(row.type))}${row.critical ? ' - Required' : ''}</span>
      </td>
      <td>
        <div class="config-cell">
          ${configConfiguredMarkup(row)}
          ${row.editable ? configActionButton(row) : ''}
        </div>
      </td>
    </tr>
  `).join('');

  els.configTable.querySelectorAll('[data-config-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      els.configKeySelect.value = button.dataset.configEdit;
      syncConfigEditor();
      if (button.dataset.configOpenPicker === 'true') {
        openConfigPicker();
      } else {
        els.configForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  els.configTable.querySelectorAll('[data-config-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const key = button.dataset.configToggle;
      const next = button.dataset.configNext === 'true';
      try {
        await saveConfigValue(key, next);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function configConfiguredMarkup(row) {
  if (row.type === 'boolean') return booleanConfigButton(row);
  const display = configChoiceLabel(row);
  const stateClass = row.empty ? 'is-off' : row.critical ? 'is-warn' : 'is-on';
  return `
    <span class="config-choice-label">
      <span class="state-chip ${stateClass}">${escapeHtml(row.empty ? 'Missing' : choiceKindLabel(row))}</span>
      <strong>${escapeHtml(display)}</strong>
    </span>
  `;
}

function configActionButton(row) {
  if (row.type === 'boolean') return '';
  const label = row.picker ? `Choose ${choiceKindLabel(row).toLowerCase()}` : 'Open';
  return `
    <button
      class="secondary-button compact"
      type="button"
      data-config-edit="${escapeAttribute(row.key)}"
      data-config-open-picker="${row.picker ? 'true' : 'false'}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function booleanConfigButton(row) {
  const enabled = Boolean(row.value);
  return `
    <button
      class="state-chip ${enabled ? 'is-on' : 'is-off'}"
      type="button"
      data-config-toggle="${escapeAttribute(row.key)}"
      data-config-next="${enabled ? 'false' : 'true'}"
    >
      ${enabled ? 'Enabled' : 'Disabled'}
    </button>
  `;
}

function syncConfigEditor() {
  if (!state.guildDetail) return;
  const row = state.guildDetail.config.find((item) => item.key === els.configKeySelect.value);
  if (!row) {
    els.configValueInput.value = '';
    els.configTextField?.classList.add('is-hidden');
    els.configChoicePanel.innerHTML = choicePanelMarkup(null);
    els.configPickerButton.disabled = true;
    return;
  }
  const isBoolean = row.type === 'boolean';
  const isPicker = Boolean(row.picker);
  els.configValueInput.value = configInputValue(row.value);
  els.configTextField?.classList.toggle('is-hidden', isBoolean || isPicker);
  els.configBooleanInput.classList.toggle('is-hidden', !isBoolean);
  els.configChoicePanel.innerHTML = choicePanelMarkup(row);
  if (isBoolean) setBooleanControlValue(Boolean(row.value));
  els.configPickerButton.classList.toggle('is-hidden', !isPicker);
  els.configPickerButton.disabled = !isPicker;
  els.configPickerButton.textContent = isPicker ? `Choose ${choiceKindLabel(row).toLowerCase()}` : 'Open';
  const submitButton = els.configForm.querySelector('button[type="submit"]');
  submitButton?.classList.toggle('is-hidden', isPicker);
  if (submitButton) submitButton.textContent = isBoolean ? 'Save state' : 'Save setting';
}

function setBooleanControlValue(enabled) {
  els.configBooleanInput.querySelectorAll('[data-boolean-value]').forEach((button) => {
    button.classList.toggle('is-active', (button.dataset.booleanValue === 'true') === enabled);
  });
}

function selectedBooleanConfigValue() {
  const selected = els.configBooleanInput.querySelector('[data-boolean-value].is-active');
  return selected?.dataset.booleanValue === 'true';
}

async function saveConfigValue(key, value) {
  const detail = await request(`/api/guilds/${encodeURIComponent(state.selectedGuildId)}/config`, {
    method: 'POST',
    body: { key, value }
  });
  state.guildDetail = detail;
  renderGuildDetail(detail);
  await loadOverview(false);
  showToast('Setting saved.');
}

function typeLabel(type) {
  const labels = {
    channel: 'channel',
    'channel-list': 'channels',
    role: 'role',
    'role-list': 'roles',
    'user-list': 'users',
    style: 'style',
    action: 'action',
    boolean: 'toggle',
    number: 'number',
    json: 'json',
    message: 'message',
    text: 'text'
  };
  return labels[type] || type || 'value';
}

function choiceKindLabel(row) {
  if (row?.key === 'invite_role_mappings') return 'Invite roles';
  const labels = {
    channel: 'Channel',
    'channel-list': 'Channels',
    role: 'Role',
    'role-list': 'Roles',
    'user-list': 'Users',
    style: 'Style',
    action: 'Action',
    number: 'Number',
    json: 'Advanced',
    message: 'Message',
    text: 'Text'
  };
  return labels[row?.type] || 'Choice';
}

function configChoiceLabel(row) {
  if (!row) return 'No setting selected';
  if (row.empty) return emptyChoiceLabel(row);
  if (row.key === 'invite_role_mappings') return 'Invite role mappings saved';
  if (row.picker) {
    const options = state.guildDetail?.options?.[row.picker] || [];
    const labels = listConfigInputValues(row.value).map((id) => {
      const option = options.find((item) => String(item.id) === String(id));
      return option?.label || null;
    }).filter(Boolean);
    if (labels.length) return labels.join(', ');
    return row.display && !looksLikeRawId(row.display) ? row.display : 'Configured';
  }
  const labels = {
    number: 'Number set',
    json: 'Advanced setting set',
    message: 'Message saved',
    text: 'Custom text saved'
  };
  return labels[row.type] || 'Configured';
}

function emptyChoiceLabel(row) {
  if (row?.key === 'invite_role_mappings') return 'Add invite roles';
  const labels = {
    channel: 'Choose a channel',
    'channel-list': 'Choose channels',
    role: 'Choose a role',
    'role-list': 'Choose roles',
    'user-list': 'Choose users',
    style: 'Choose a style',
    action: 'Choose an action',
    number: 'Enter a number',
    json: 'Add advanced data',
    message: 'Write a message',
    text: 'Add text'
  };
  return labels[row?.type] || 'Choose a value';
}

function choicePanelMarkup(row) {
  if (!row) {
    return `
      <span>Current choice</span>
      <strong>No setting selected</strong>
      <small>Setting</small>
    `;
  }
  if (row.type === 'boolean') {
    return `
      <span>Current state</span>
      <strong>${Boolean(row.value) ? 'Enabled' : 'Disabled'}</strong>
      <small>Toggle</small>
    `;
  }
  return `
    <span>Current choice</span>
    <strong>${escapeHtml(configChoiceLabel(row))}</strong>
    <small>${escapeHtml(choiceKindLabel(row))}</small>
  `;
}

function looksLikeRawId(value) {
  return /^[\d,\s]+$/.test(String(value || '').trim());
}

function configInputValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function renderServerControlCenter(detail) {
  const categories = detail.options?.categories || [];
  const channels = detail.options?.channels || [];
  const roles = detail.options?.roles || [];

  fillSelect(els.channelCreateCategorySelect, categories, 'No category', false);
  fillSelect(els.channelManageSelect, channels, 'Choose a channel', true);
  fillSelect(els.channelManageCategorySelect, categories, 'No category', false);
  fillSelect(els.categoryManageSelect, categories, 'Choose a category', true);
  fillSelect(els.roleManageSelect, roles, 'Choose a role', true);

  if (document.activeElement !== els.serverNameInput) {
    els.serverNameInput.value = detail.guild?.name || '';
  }

  els.serverControlStatus.textContent = `${formatNumber(channels.length)} channels - ${formatNumber(categories.length)} categories - ${formatNumber(roles.length)} roles`;
  syncChannelManager();
  syncCategoryManager();
  syncRoleManager();
}

function syncChannelManager() {
  const channel = selectedDashboardOption('channels', els.channelManageSelect.value);
  const disabled = !channel;
  els.channelManageNameInput.disabled = disabled;
  els.channelManageCategorySelect.disabled = disabled;
  els.channelManageTopicInput.disabled = disabled;
  els.channelManageSlowmodeInput.disabled = disabled;
  els.channelManageLockSelect.disabled = disabled;
  els.channelRenameButton.disabled = disabled;
  els.channelUpdateButton.disabled = disabled;
  els.channelDeleteButton.disabled = disabled;
  if (!channel) {
    els.channelManageNameInput.value = '';
    els.channelManageTopicInput.value = '';
    els.channelManageSlowmodeInput.value = '0';
    els.channelManageLockSelect.value = 'keep';
    return;
  }
  if (document.activeElement !== els.channelManageNameInput) {
    els.channelManageNameInput.value = channel.label || '';
  }
  if (document.activeElement !== els.channelManageTopicInput) {
    els.channelManageTopicInput.value = channel.topic || '';
  }
  if (document.activeElement !== els.channelManageSlowmodeInput) {
    els.channelManageSlowmodeInput.value = String(channel.slowmode || 0);
  }
  setSelectValue(els.channelManageCategorySelect, channel.parentId || '');
  if (els.channelManageLockSelect.value !== 'lock' && els.channelManageLockSelect.value !== 'unlock') {
    els.channelManageLockSelect.value = 'keep';
  }
}

function syncCategoryManager() {
  const category = selectedDashboardOption('categories', els.categoryManageSelect.value);
  const disabled = !category;
  els.categoryManageNameInput.disabled = disabled;
  els.categoryRenameButton.disabled = disabled;
  els.categoryDeleteButton.disabled = disabled;
  if (!category) {
    els.categoryManageNameInput.value = '';
    return;
  }
  if (document.activeElement !== els.categoryManageNameInput) {
    els.categoryManageNameInput.value = category.label || '';
  }
}

function syncRoleManager() {
  const role = selectedDashboardOption('roles', els.roleManageSelect.value);
  const disabled = !role;
  els.roleManageNameInput.disabled = disabled;
  els.roleRenameButton.disabled = disabled;
  els.roleDeleteButton.disabled = disabled;
  if (!role) {
    els.roleManageNameInput.value = '';
    return;
  }
  if (document.activeElement !== els.roleManageNameInput) {
    els.roleManageNameInput.value = role.label || '';
  }
}

function selectedDashboardOption(type, id) {
  return (state.guildDetail?.options?.[type] || []).find((item) => item.id === id) || null;
}

async function runSelectedGuildAction(payload, options = {}) {
  if (!state.selectedGuildId) return null;
  const button = options.button || null;
  if (button) button.disabled = true;
  if (els.serverControlStatus) els.serverControlStatus.textContent = 'Working...';
  try {
    const response = await request(`/api/guilds/${encodeURIComponent(state.selectedGuildId)}/action`, {
      method: 'POST',
      body: payload
    });
    if (response.detail) {
      state.guildDetail = response.detail;
      renderGuildDetail(response.detail);
    }
    if (typeof options.onSuccess === 'function') options.onSuccess(response);
    const message = response.message || `${payload.action} complete.`;
    if (els.serverControlStatus) els.serverControlStatus.textContent = message;
    showToast(message);
    await loadOverview(false).catch(() => null);
    return response;
  } catch (err) {
    if (els.serverControlStatus) els.serverControlStatus.textContent = err.message || 'Action failed.';
    showToast(err.message || 'Server action failed.');
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderServerActions(guild) {
  els.serverActionBar.innerHTML = `
    <div class="action-group">
      <button class="secondary-button" type="button" data-guild-action="lockdown">Lockdown</button>
      <button class="secondary-button" type="button" data-guild-action="unlockdown">Unlockdown</button>
      <button class="secondary-button" type="button" data-guild-action="channel-restriction">Apply Restriction Visibility</button>
      <button class="secondary-button" type="button" data-guild-action="mass-sync-categories">Sync Categories</button>
    </div>
    <div class="danger-group">
      <input id="leaveConfirmInput" type="text" placeholder="${escapeAttribute(guild.id)}">
      <button id="leaveGuildButton" class="danger-button" type="button">Leave Server</button>
    </div>
  `;

  els.serverActionBar.querySelectorAll('[data-guild-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runSelectedGuildAction({ action: button.dataset.guildAction }, { button });
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

async function applyPickerSelection() {
  if (!state.picker) return;
  const picker = state.picker;
  const values = [...picker.selected];
  const value = picker.row.multiple ? values : (values[0] || '');
  els.configValueInput.value = Array.isArray(value) ? value.join(', ') : value;
  els.configChoicePanel.innerHTML = choicePanelMarkup({
    ...picker.row,
    value,
    empty: values.length === 0
  });
  els.pickerApplyButton.disabled = true;
  try {
    closePicker();
    await saveConfigValue(picker.row.key, value);
  } finally {
    els.pickerApplyButton.disabled = false;
  }
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

function renderTicketPanelList(panels) {
  const panelRows = (panels || []).map((panel) => `
    <div class="ticket-panel-row">
      <div>
        <strong>${escapeHtml(panel.name)}</strong>
        <span>${escapeHtml(panel.description || panel.panelId)}</span>
        <small>${escapeHtml(panel.panelChannel)} - ${escapeHtml(panel.supportRole)} - ${escapeHtml(panel.category)} - ${escapeHtml(panel.panelId)}</small>
      </div>
      <div class="ticket-row-actions">
        <span class="state-chip ${panel.mode === 'channel' ? 'is-warn' : 'is-on'}">${panel.mode === 'channel' ? 'Channels' : 'Threads'}</span>
        <button class="secondary-button compact" type="button" data-ticket-edit="${escapeAttribute(panel.panelId)}">Edit</button>
      </div>
    </div>
  `);

  els.ticketPanelList.innerHTML = panelRows.join('') || '<div class="empty-state">No ticket panels yet.</div>';

  els.ticketPanelList.querySelectorAll('[data-ticket-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = (state.guildDetail?.ticketPanels || []).find((item) => item.panelId === button.dataset.ticketEdit);
      if (!panel) return;
      fillTicketPanelForm(panel);
      els.ticketPanelForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(`Editing ${panel.name}.`);
    });
  });
}

function renderTickets(tickets) {
  const ticketRows = (tickets || []).map((ticket) => `
    <div class="data-row ticket-activity-row">
      <strong>${escapeHtml(ticket.userLabel)}</strong>
      <span>${escapeHtml(ticket.channelLabel)} - ${escapeHtml(ticket.panelId)}</span>
      <small>${escapeHtml(ticket.status)} - opened ${formatDate(ticket.openedAt)}${ticket.closedAt ? ` - closed ${formatDate(ticket.closedAt)}` : ''}</small>
    </div>
  `);

  els.ticketList.innerHTML = ticketRows.join('') || '<div class="empty-state">No ticket activity yet.</div>';
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
  if (['server', 'tickets'].includes(view) && state.selectedGuildId && !state.guildDetail) {
    loadGuild(state.selectedGuildId).catch((err) => showToast(err.message));
  }
  if (view === 'commands') {
    renderCommandCatalog(state.overview?.commandCatalog || []);
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
  els.commandCatalog.innerHTML = '<div class="empty-state">Command catalog unavailable.</div>';
  els.commandCategoryList.innerHTML = '<div class="empty-state">Categories unavailable.</div>';
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

async function uploadBackupFile(file) {
  const response = await fetch(dashboardUrl('/api/owner/backup/import'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Backup-Name': file.name || 'backup.sqlite'
    },
    body: file
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) showLogin();
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
