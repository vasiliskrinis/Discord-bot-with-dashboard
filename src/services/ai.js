const env = require('../env');

function stripBotMention(content, clientId) {
  return content
    .replace(new RegExp(`<@!?${clientId}>`, 'g'), '')
    .trim();
}

async function askAI(prompt, options = {}) {
  const personality = options.personality || env.aiPersonality;
  const behavior = options.behavior || env.aiBehavior;
  const systemSuffix = options.systemSuffix || 'Answer as a Discord bot. Keep plain text short unless asked for detail.';
  const promptStack = options.promptStack
    ? `\n\nActive server prompt stack:\n${options.promptStack}`
    : '';

  if (!env.hfApiKey) {
    return 'AI is configured, but HUGGING_FACE_API_KEY is missing in .env.';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiTimeoutMs);

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.hfApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.hfModel,
      messages: [
        {
          role: 'system',
          content: `${personality}\n${behavior}${promptStack}\n${systemSuffix}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: options.maxTokens || env.aiMaxTokens,
      temperature: options.temperature ?? 0.7
    }),
    signal: controller.signal
  }).catch((error) => ({ ok: false, status: 0, error }));

  clearTimeout(timeout);

  if (!response.ok) {
    const networkDetail = response.error?.cause?.code || response.error?.message;
    if (response.error?.name === 'AbortError') {
      return `AI provider timed out after ${Math.round(env.aiTimeoutMs / 1000)}s. Try again or use a faster HF_MODEL in .env.`;
    }
    if (response.status === 0) {
      return `AI provider network error${networkDetail ? `: ${networkDetail}` : ''}. The bot could not reach Hugging Face.`;
    }
    const body = await response.text().catch(() => '');
    return `AI provider error (${response.status}). Check the Hugging Face key/model in .env.${body ? ` ${body.slice(0, 250)}` : ''}`;
  }

  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (content) return content.trim();
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text.trim();
  if (data?.generated_text) return data.generated_text.trim();
  if (data?.error) return `AI provider error: ${data.error}`;
  return 'AI did not return text.';
}

function moderateText(content) {
  if (!env.aiModeration) return { blocked: false };
  const lowered = String(content || '').toLowerCase();
  const hit = env.aiModerationBlockWords.find((word) => lowered.includes(word.toLowerCase()));
  if (hit) {
    return {
      blocked: true,
      reason: `Blocked by AI moderation keyword: ${hit}`
    };
  }
  return { blocked: false };
}

function parseAiModerationCommand(message, clientId, options = {}) {
  const content = stripBotMention(message.content, clientId).toLowerCase();
  const mentioned = message.mentions.members.first() || options.targetMember || null;
  if (!mentioned) return null;

  const reasonMatch = message.content.match(/\b(?:because|cause|for|reason)\b\s+(.+)$/i);
  const reason = reasonMatch?.[1]?.trim() || 'AI command request';

  const actions = [
    [/\b(unrestrict|free|release)\b/, 'unrestrict'],
    [/\bunmute\b/, 'unmute'],
    [/\brestrict\b|\bjail\b/, 'restrict'],
    [/\bban\b/, 'ban'],
    [/\bkick\b/, 'kick'],
    [/\bmute\b|\btimeout\b/, 'mute'],
    [/\bwarn\b/, 'warn']
  ];

  const action = actions.find(([pattern]) => pattern.test(content));
  if (!action) return null;
  return {
    command: action[1],
    target: mentioned,
    reason
  };
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return null;
  return text.slice(0, 2048);
}

function normalizeEmbedData(data, fallbackDescription) {
  const fields = Array.isArray(data?.fields)
    ? data.fields
        .map((field) => ({
          name: cleanText(field?.name, 'Field', 256),
          value: cleanText(field?.value, 'None', 1024),
          inline: Boolean(field?.inline)
        }))
        .filter((field) => field.name && field.value)
        .slice(0, 25)
    : [];

  return {
    title: cleanText(data?.title, 'AI Embed', 256),
    description: cleanText(data?.description, fallbackDescription, 4000),
    color: typeof data?.color === 'string' ? data.color.trim().slice(0, 20) : null,
    fields,
    image: cleanUrl(data?.image),
    thumbnail: cleanUrl(data?.thumbnail)
  };
}

async function createEmbedFromAI(description) {
  const input = String(description || '').trim();
  if (!input) throw new Error('Describe the embed you want.');

  const answer = await askAI(
    [
      'Create one Discord embed from this user request.',
      'Return only valid compact JSON with these keys:',
      '{"title":"short title","description":"main embed text","color":"#5865f2","fields":[{"name":"field name","value":"field value","inline":false}],"image":null,"thumbnail":null}',
      'Do not include markdown fences or explanations. Use null for image/thumbnail unless the user gives a direct URL.',
      '',
      `User request: ${input}`
    ].join('\n'),
    {
      personality: 'You are an expert Discord embed designer.',
      behavior: 'Turn natural language into clean, useful embed content.',
      systemSuffix: 'Return only valid JSON. No markdown. No extra text.',
      maxTokens: 450,
      temperature: 0.2
    }
  );

  if (/^AI provider (error|network error|timed out)/i.test(answer)) {
    throw new Error(answer.slice(0, 300));
  }

  const json = extractJsonObject(answer);
  if (!json) return normalizeEmbedData(null, input);

  try {
    const parsed = JSON.parse(json);
    return normalizeEmbedData(parsed, input);
  } catch {
    return normalizeEmbedData(null, input);
  }
}

module.exports = {
  askAI,
  createEmbedFromAI,
  moderateText,
  parseAiModerationCommand,
  stripBotMention
};
