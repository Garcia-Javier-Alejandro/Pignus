import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');

export function updateEnvValues(updates) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Cannot update tokens because .env does not exist at ${envPath}`);
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const remainingUpdates = new Map(Object.entries(updates));
  const seenKeys = new Set();

  const nextLines = [];

  for (const line of lines) {
    const match = line.match(/^\s*([^#=\s]+)\s*=/);

    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);

    if (!remainingUpdates.has(key)) {
      nextLines.push(line);
      continue;
    }

    const value = remainingUpdates.get(key);
    remainingUpdates.delete(key);
    nextLines.push(`${key}=${value ?? ''}`);
  }

  for (const [key, value] of remainingUpdates) {
    nextLines.push(`${key}=${value ?? ''}`);
  }

  fs.writeFileSync(envPath, nextLines.join('\n'));
}
