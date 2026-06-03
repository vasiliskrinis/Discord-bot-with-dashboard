const VALID_SCOPES = new Set(['global', 'server', 'channel', 'ticket']);

function assertScope(scopeType) {
  if (!VALID_SCOPES.has(scopeType)) {
    throw new Error('Prompt scope must be global, server, channel, or ticket.');
  }
}

function resolveScopeId(db, scopeType, context, explicitScopeId = null) {
  assertScope(scopeType);
  if (scopeType === 'global') return 'global';
  if (explicitScopeId) return String(explicitScopeId).trim();

  if (scopeType === 'server') {
    if (!context.guild?.id) throw new Error('Server prompt scope requires a server.');
    return context.guild.id;
  }

  if (scopeType === 'channel') {
    if (!context.channel?.id) throw new Error('Channel prompt scope requires a channel.');
    return context.channel.id;
  }

  const ticket = context.guild?.id && context.channel?.id
    ? db.getTicketByChannel(context.guild.id, context.channel.id)
    : null;
  if (!ticket) throw new Error('Ticket prompt scope requires a ticket channel or explicit scope ID.');
  return `${ticket.panel_id}:${ticket.user_id}`;
}

function setPrompt(db, context, options) {
  const scopeId = resolveScopeId(db, options.scopeType, context, options.scopeId);
  return db.setAiPrompt({
    scopeType: options.scopeType,
    scopeId,
    name: options.name || 'default',
    content: options.content,
    presetKey: options.presetKey || null,
    createdBy: options.userId || null
  });
}

function getPrompt(db, context, options) {
  const scopeId = resolveScopeId(db, options.scopeType, context, options.scopeId);
  return db.getAiPrompt(options.scopeType, scopeId, options.name || 'default');
}

function listHistory(db, context, options) {
  const scopeId = resolveScopeId(db, options.scopeType, context, options.scopeId);
  return db.listAiPromptHistory(options.scopeType, scopeId, options.name || 'default', options.limit || 10);
}

function rollbackPrompt(db, context, options) {
  const scopeId = resolveScopeId(db, options.scopeType, context, options.scopeId);
  return db.rollbackAiPrompt(
    options.scopeType,
    scopeId,
    options.name || 'default',
    options.version,
    options.userId || null
  );
}

function buildPromptStack(db, context) {
  const scopes = [
    ['global', 'global'],
    context.guild?.id ? ['server', context.guild.id] : null,
    context.channel?.id ? ['channel', context.channel.id] : null
  ].filter(Boolean);

  const ticket = context.guild?.id && context.channel?.id
    ? db.getTicketByChannel(context.guild.id, context.channel.id)
    : null;
  if (ticket) scopes.push(['ticket', `${ticket.panel_id}:${ticket.user_id}`]);

  const parts = [];
  for (const [scopeType, scopeId] of scopes) {
    const prompts = db.listActiveAiPrompts(scopeType, scopeId, 25);
    for (const prompt of prompts) {
      parts.push(`[${scopeType}:${prompt.name}:v${prompt.version}]\n${prompt.content}`);
    }
  }

  return parts.join('\n\n');
}

function testPrompt(db, context, options) {
  const prompt = getPrompt(db, context, options);
  if (!prompt) return null;
  const stack = buildPromptStack(db, context);
  return [
    'Prompt preview:',
    stack || prompt.content,
    '',
    `User input: ${options.input || 'Test message'}`,
    '',
    `Dry run: I would answer using the active prompt stack for ${options.scopeType}:${prompt.name}.`
  ].join('\n');
}

module.exports = {
  VALID_SCOPES,
  buildPromptStack,
  getPrompt,
  listHistory,
  rollbackPrompt,
  resolveScopeId,
  setPrompt,
  testPrompt
};
