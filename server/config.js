import fs from 'node:fs';
import path from 'node:path';

// .env を簡易読み込み（依存を増やさない）
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  port: Number(env.PORT || 3000),
  isProd,
  demoMode: env.DEMO_MODE === 'true',
  publicBaseUrl: (env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: path.resolve(env.DATA_DIR || './data'),
  pseudoSecret: env.PSEUDO_ID_SECRET || 'dev-only-secret',
  encryptionKey: env.DATA_ENCRYPTION_KEY ? Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64') : null,
  exportIdMode: env.EXPORT_ID_MODE === 'plain' ? 'plain' : 'hmac',
  ai: {
    provider: env.AI_PROVIDER || 'mock',
    concurrency: Number(env.AI_CONCURRENCY || 4),
    awsRegion: env.AWS_REGION || 'ap-northeast-1',
    bedrockModelOcr: env.BEDROCK_MODEL_OCR || 'jp.anthropic.claude-sonnet-4-5-20250929-v1:0',
    bedrockModelText: env.BEDROCK_MODEL_TEXT || 'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicModelOcr: env.ANTHROPIC_MODEL_OCR || 'claude-sonnet-5',
    anthropicModelText: env.ANTHROPIC_MODEL_TEXT || 'claude-haiku-4-5-20251001',
  },
  upload: { maxFiles: 3, maxBytes: 10 * 1024 * 1024 },
  sessionDays: 30,
};

export function assertProductionConfig() {
  if (!isProd) return;
  const problems = [];
  if (config.pseudoSecret === 'dev-only-secret' || config.pseudoSecret.length < 32) problems.push('PSEUDO_ID_SECRET（32文字以上）');
  if (!config.encryptionKey || config.encryptionKey.length !== 32) problems.push('DATA_ENCRYPTION_KEY（base64の32バイト）');
  if (!config.publicBaseUrl.startsWith('https://')) problems.push('PUBLIC_BASE_URL（https）');
  if (config.ai.provider === 'anthropic') console.warn('[警告] AI_PROVIDER=anthropic は国内リージョン処理要件を満たしません。');
  if (problems.length) {
    console.error('本番起動に必要な設定が不足しています: ' + problems.join(', '));
    process.exit(1);
  }
}
