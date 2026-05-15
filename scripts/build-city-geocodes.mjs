#!/usr/bin/env node
// build-city-geocodes.mjs
// Reads distinct localidad+provincia pairs from the orders cache, geocodes them
// via Nominatim (1 req/sec), and writes public/ar-cities.json.
//
// Usage: node scripts/build-city-geocodes.mjs [cache-base-url]
// Default: http://localhost:8788  (wrangler pages dev)
//
// Note: the live deployment is behind Cloudflare Access. Run against the local
// dev server: npx wrangler pages dev public --kv PIGNUS_TOKENS=<namespace-id>

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT    = join(__dirname, '../public/ar-cities.json');
const BASE_URL  = process.argv[2] || 'http://localhost:8788';

// Argentine province centroids — always written to the JSON as "|provincia" keys
const PROVINCE_CENTROIDS = {
  'Buenos Aires':                    [-36.6769, -60.5588],
  'Ciudad Autónoma de Buenos Aires': [-34.6037, -58.3816],
  'Catamarca':                       [-28.4696, -65.7795],
  'Chaco':                           [-27.4516, -59.0243],
  'Chubut':                          [-43.2930, -65.1023],
  'Córdoba':                         [-31.4135, -64.1811],
  'Corrientes':                      [-27.4806, -58.8341],
  'Entre Ríos':                      [-31.7746, -60.4959],
  'Formosa':                         [-26.1849, -58.1731],
  'Jujuy':                           [-24.1858, -65.2995],
  'La Pampa':                        [-37.1315, -65.4490],
  'La Rioja':                        [-29.4131, -66.8558],
  'Mendoza':                         [-34.6297, -68.5194],
  'Misiones':                        [-27.4269, -55.9478],
  'Neuquén':                         [-38.9516, -68.0591],
  'Río Negro':                       [-40.8135, -63.0000],
  'Salta':                           [-24.7821, -65.4232],
  'San Juan':                        [-31.5375, -68.5364],
  'San Luis':                        [-33.2950, -66.3356],
  'Santa Cruz':                      [-51.6230, -69.2168],
  'Santa Fe':                        [-30.7069, -60.9498],
  'Santiago del Estero':             [-27.7824, -64.2643],
  'Tierra del Fuego':                [-54.8019, -68.3030],
  'Tucumán':                         [-26.8083, -65.2176],
};

// Free-text aliases that appear in ML shipping addresses
const CITY_ALIASES = {
  'CABA':                            'Ciudad Autónoma de Buenos Aires',
  'Capital Federal':                 'Ciudad Autónoma de Buenos Aires',
  'C.A.B.A.':                        'Ciudad Autónoma de Buenos Aires',
  'Ciudad Autónoma':                 'Ciudad Autónoma de Buenos Aires',
  'Caba':                            'Ciudad Autónoma de Buenos Aires',
  'ciudad autonoma de buenos aires': 'Ciudad Autónoma de Buenos Aires',
};

const PROVINCE_ALIASES = {
  'CABA':                    'Ciudad Autónoma de Buenos Aires',
  'Capital Federal':         'Ciudad Autónoma de Buenos Aires',
  'C.A.B.A.':                'Ciudad Autónoma de Buenos Aires',
  'Bs As':                   'Buenos Aires',
  'Bs. As.':                 'Buenos Aires',
  'Prov. Buenos Aires':      'Buenos Aires',
};

const normalize = (aliases, s) => aliases[s] || aliases[s.toLowerCase()] || s;

async function nominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ar`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'PignusFacturacion/1.0 (garcia.javier.alejandro@gmail.com)' },
  });
  const data = await res.json();
  return data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Fetching cache from ${BASE_URL}/api/orders/cache …`);
  const res = await fetch(`${BASE_URL}/api/orders/cache`);
  if (!res.ok) { console.error(`HTTP ${res.status} — is the local dev server running?`); process.exit(1); }
  const { headers, rows } = await res.json();

  const locIdx  = headers.indexOf('Localidad');
  const provIdx = headers.indexOf('Provincia');
  if (locIdx === -1 || provIdx === -1) { console.error('Missing Localidad/Provincia columns'); process.exit(1); }

  // Collect distinct city+province pairs, ordered by frequency (most common first)
  const freq = new Map();
  for (const row of rows) {
    const loc  = normalize(CITY_ALIASES,    (row[locIdx]  || '').trim());
    const prov = normalize(PROVINCE_ALIASES, (row[provIdx] || '').trim());
    if (!prov) continue;
    const key = `${loc}|${prov}`;
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const pairs = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  console.log(`Found ${pairs.length} distinct localidad+provincia pairs`);

  // Load existing JSON
  const existing = existsSync(OUTPUT)
    ? JSON.parse(readFileSync(OUTPUT, 'utf-8'))
    : {};

  // Always refresh province centroids
  for (const [prov, coords] of Object.entries(PROVINCE_CENTROIDS)) {
    existing[`|${prov}`] = coords;
  }

  // Geocode only new pairs
  const todo = pairs.filter((k) => !existing[k]);
  console.log(`Geocoding ${todo.length} new pairs (${pairs.length - todo.length} already cached) …\n`);

  for (let i = 0; i < todo.length; i++) {
    const key  = todo[i];
    const [loc, prov] = key.split('|');
    process.stdout.write(`[${i + 1}/${todo.length}] ${key} … `);

    await sleep(1100); // Nominatim rate limit: ≤ 1 req/sec
    const coords = loc
      ? await nominatim(`${loc}, ${prov}, Argentina`) ?? await nominatim(`${prov}, Argentina`)
      : await nominatim(`${prov}, Argentina`);

    if (coords) {
      existing[key] = coords;
      console.log(`${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);
    } else {
      console.log('not found — will fall back to province centroid');
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(existing, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(existing).length} entries → ${OUTPUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
