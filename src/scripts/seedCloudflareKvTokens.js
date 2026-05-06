import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, requireEnv } from '../config/env.js';

requireEnv([
  'MELI_ACCESS_TOKEN',
  'MELI_REFRESH_TOKEN',
  'MELI_TOKEN_EXPIRES_AT',
  'MELI_SELLER_ID',
]);

const namespaceId = process.env.CLOUDFLARE_TOKENS_KV_NAMESPACE_ID || '547a6a10d4004fc58410e0d7226f65be';
const tempPath = path.join(os.tmpdir(), `pignus-meli-tokens-${Date.now()}.json`);

const tokens = {
  access_token: config.meli.accessToken,
  refresh_token: config.meli.refreshToken,
  expires_at: config.meli.tokenExpiresAt,
  seller_id: config.meli.sellerId,
};

fs.writeFileSync(tempPath, JSON.stringify(tokens));

const wranglerCommand = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';

const result = spawnSync(wranglerCommand, [
  'kv',
  'key',
  'put',
  'meli_tokens',
  '--namespace-id',
  namespaceId,
  '--path',
  tempPath,
  '--remote',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

fs.rmSync(tempPath, { force: true });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.info('Seeded Mercado Libre tokens into Cloudflare KV.');
