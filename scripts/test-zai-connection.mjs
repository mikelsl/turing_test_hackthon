import 'dotenv/config';

const backend = (process.env.LLM_BACKEND || '').trim().toLowerCase();
const useOpenRouter = backend === 'openrouter' || backend === 'openrouter-glm' || backend === 'openrouter-glm-speech' || process.env.OPENROUTER_API_KEY;
const baseUrl = (process.env.LLM_BASE_URL || process.env.ZAI_BASE_URL || (useOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.z.ai/api/paas/v4')).replace(/\/$/, '');
const apiKey = process.env.LLM_API_KEY || process.env.ZAI_API_KEY || process.env.OPENROUTER_API_KEY;
const model = process.env.LLM_MODEL || process.env.ZAI_MODEL || (useOpenRouter ? 'z-ai/glm-4.5-air:free' : 'glm-4.5');
const useResponseFormat = process.env.LLM_RESPONSE_FORMAT !== '0';

if (!apiKey) {
  console.error('[llm] missing LLM_API_KEY, ZAI_API_KEY, or OPENROUTER_API_KEY');
  process.exit(2);
}

const body = {
  model,
  messages: [
    {
      role: 'system',
      content: 'Return only compact JSON. No markdown.'
    },
    {
      role: 'user',
      content: 'Reply with {"ok":true,"provider":"glm","purpose":"turing-mindgames-readiness"}.'
    }
  ],
  temperature: 0.1,
  max_tokens: 160,
  ...(useOpenRouter ? { reasoning: { enabled: false } } : {}),
  ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {})
};

const started = Date.now();
const res = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    ...(useOpenRouter ? { 'http-referer': 'https://turing-mindgames.local', 'x-title': 'Turing MindGames Arena' } : {})
  },
  body: JSON.stringify(body)
});

const elapsedMs = Date.now() - started;
const text = await res.text();
if (!res.ok) {
  console.error(JSON.stringify({ ok: false, status: res.status, elapsedMs, body: text.slice(0, 800) }, null, 2));
  process.exit(1);
}

let json;
try {
  json = JSON.parse(text);
} catch {
  console.error(JSON.stringify({ ok: false, status: res.status, elapsedMs, parseError: 'non-json response', body: text.slice(0, 800) }, null, 2));
  process.exit(1);
}

const content = json.choices?.[0]?.message?.content ?? '';
let parsedContent = null;
try {
  parsedContent = JSON.parse(content);
} catch {
  const match = String(content).match(/\{[\s\S]*\}/);
  if (match) parsedContent = JSON.parse(match[0]);
}

console.log(JSON.stringify({
  ok: true,
  status: res.status,
  elapsedMs,
  baseUrl,
  model,
  responseFormat: useResponseFormat,
  content: parsedContent ?? content
}, null, 2));
