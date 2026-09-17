import { config } from '../config.js';
import { mockProvider } from './mock.js';
import { bedrockProvider, anthropicProvider } from './llm.js';
import { normalizeTags } from '../lib/taxonomy.js';

const providers = { mock: mockProvider, bedrock: bedrockProvider, anthropic: anthropicProvider };

export function ai() {
  const p = providers[config.ai.provider];
  if (!p) throw new Error('AI_PROVIDERが不正です。mock・bedrock・anthropicから選択してください');
  return {
    name: p.name,
    ocr: (images) => p.ocr(images),
    analyze: async (input) => {
      const r = await p.analyze(input);
      return { ...r, tags: normalizeTags(r.tags) };
    },
    voiceSummary: (i) => p.voiceSummary(i),
    periodSummary: (i) => p.periodSummary(i),
    freeText: (i) => p.freeText(i),
    worksheet: (i) => p.worksheet(i),
  };
}
