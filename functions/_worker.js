import { onRequestGet as meliCallbackHandler } from './api/auth/mercadolibre/callback/index.js';
import { onRequestPost as exportHandler } from './api/orders/export.js';
import { onRequestGet as recentHandler } from './api/orders/recent.js';
import { fetchAllPaidOrders } from './_lib/meliOrders.js';
import { appendRows, getExistingOrderIds } from './_lib/sheets.js';
import { OUTPUT_HEADERS, transformOrdersToRows } from './_lib/transform.js';

async function runSync(env) {
  const [orders, existingOrderIds] = await Promise.all([
    fetchAllPaidOrders(env),
    getExistingOrderIds(env),
  ]);

  const newOrders = orders.filter((order) => !existingOrderIds.has(String(order.id)));
  const transformedRows = transformOrdersToRows(newOrders);
  const rows = existingOrderIds.size === 0
    ? [OUTPUT_HEADERS, ...transformedRows]
    : transformedRows;

  await appendRows(env, rows);

  return { total: orders.length, appended: newOrders.length, skipped: orders.length - newOrders.length };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/auth/mercadolibre/callback') && request.method === 'GET') {
      return meliCallbackHandler({ request, env, ctx });
    }

    if (url.pathname === '/api/orders/export' && request.method === 'POST') {
      return exportHandler({ request, env, ctx });
    }

    if (url.pathname === '/api/orders/recent' && request.method === 'GET') {
      return recentHandler({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },

  // Runs daily at 06:00 UTC (03:00 Argentina time). Appends any paid orders not yet in Sheets.
  async scheduled(event, env, ctx) {
    const result = await runSync(env);
    console.log(`Scheduled sync complete: ${result.appended} appended, ${result.skipped} skipped of ${result.total} total.`);
  },
};
