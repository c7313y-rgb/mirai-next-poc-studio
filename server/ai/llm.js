import { config } from '../config.js';
import { keywordConcern } from '../lib/safety.js';
import { normalizeTags } from '../lib/taxonomy.js';
import { sendWithAiBudget } from '../lib/ai-budget.js';
import { OCR_PROMPT, analyzePrompt, voicePrompt, periodSummaryPrompt, freeTextPrompt, worksheetPrompt, extractJson } from './prompts.js';

// ---- 送信層（Bedrock / Anthropic API）----
async function sendAnthropic({ model, prompt, images = [], maxTokens = 1500 }) {
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.buffer.toString('base64') } })),
    { type: 'text', text: prompt },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.ai.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

let bedrockClient;
async function sendBedrock({ model, prompt, images = [], maxTokens = 1500 }) {
  let sdk;
  try {
    sdk = await import('@aws-sdk/client-bedrock-runtime');
  } catch {
    throw new Error('@aws-sdk/client-bedrock-runtime が未インストールです（npm install で導入されます）');
  }
  // The worker owns retries; SDK retries would evade the per-attempt reservation.
  bedrockClient ||= new sdk.BedrockRuntimeClient({ region: config.ai.awsRegion, maxAttempts: 1 });
  const fmt = (mime) => ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] || 'jpeg');
  const content = [
    ...images.map((img) => ({ image: { format: fmt(img.mime), source: { bytes: img.buffer } } })),
    { text: prompt },
  ];
  const out = await bedrockClient.send(new sdk.ConverseCommand({
    modelId: model,
    messages: [{ role: 'user', content }],
    inferenceConfig: { maxTokens, temperature: 0.2 },
  }), { abortSignal: AbortSignal.timeout(60_000) });
  return (out.output?.message?.content || []).map((c) => c.text || '').join('\n');
}

function makeLlmProvider(kind) {
  const transport = kind === 'bedrock' ? sendBedrock : sendAnthropic;
  const send = (request) => sendWithAiBudget(transport, request);
  const models = kind === 'bedrock'
    ? { ocr: config.ai.bedrockModelOcr, text: config.ai.bedrockModelText }
    : { ocr: config.ai.anthropicModelOcr, text: config.ai.anthropicModelText };

  return {
    name: kind,
    async ocr(images) {
      const text = await send({ model: models.ocr, prompt: OCR_PROMPT, images, maxTokens: 2000 });
      return { text: text.trim() };
    },
    async analyze(input) {
      const raw = await send({ model: models.text, prompt: analyzePrompt(input), maxTokens: 800 });
      const j = extractJson(raw);
      const kw = keywordConcern(input.text);
      const aiFlag = Boolean(j?.concern?.flag);
      return {
        feedback: String(j.feedback || '').slice(0, 400),
        tags: normalizeTags(j.tags),
        summary: String(j.summary || '').slice(0, 200),
        // AIとキーワードの OR（見逃しを減らす側に倒す）
        concern: { flag: aiFlag || kw.flag, reason: [aiFlag ? j.concern.reason : null, kw.reason].filter(Boolean).join(' / ') || null },
      };
    },
    async voiceSummary(input) {
      return extractJson(await send({ model: models.text, prompt: voicePrompt(input), maxTokens: 1000 }));
    },
    async periodSummary(input) {
      return (await send({ model: models.text, prompt: periodSummaryPrompt(input), maxTokens: 600 })).trim();
    },
    async freeText(input) {
      return extractJson(await send({ model: models.text, prompt: freeTextPrompt(input), maxTokens: 1200 }));
    },
    async worksheet(input) {
      return extractJson(await send({ model: models.text, prompt: worksheetPrompt(input), maxTokens: 1500 }));
    },
  };
}

export const bedrockProvider = makeLlmProvider('bedrock');
export const anthropicProvider = makeLlmProvider('anthropic');
