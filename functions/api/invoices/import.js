import { json, errorResponse } from '../../_lib/http.js';
import { getOrdersCache, saveOrdersCache } from '../../_lib/ordersCache.js';

const EDITS_KEY = 'edits';

export async function onRequestPost({ request, env }) {
  try {
    const { mlMatches = {}, invoiceRows = [] } = await request.json();

    const [cache, edits] = await Promise.all([
      getOrdersCache(env),
      env.PIGNUS_TOKENS.get(EDITS_KEY, 'json').then(
        (e) => e || { manualRows: [], hiddenIds: [], mlOverrides: {}, invoiceRows: [] },
      ),
    ]);

    let mlUpdated = 0;
    let mlOverwritten = 0;
    const seenNums = new Set();

    for (const order of cache.orders) {
      const match = mlMatches[String(order.id)] || mlMatches[String(order.pack_id)];
      if (!match) continue;

      // For pack siblings sharing the same invoice, update without counting again
      if (seenNums.has(match.numero)) {
        order._numero_factura = match.numero;
        order._fecha_factura = match.fecha;
        order._invoice_source = 'contabilium';
        continue;
      }
      seenNums.add(match.numero);

      if (order._numero_factura && order._numero_factura !== match.numero) mlOverwritten++;
      order._numero_factura = match.numero;
      order._fecha_factura = match.fecha;
      order._invoice_source = 'contabilium';
      mlUpdated++;
    }

    const existingByNumero = new Map((edits.invoiceRows || []).map((r) => [String(r[0]), r]));
    let invoicesAdded = 0;
    let invoicesReplaced = 0;
    for (const row of invoiceRows) {
      const key = String(row[0]);
      existingByNumero.has(key) ? invoicesReplaced++ : invoicesAdded++;
      existingByNumero.set(key, row);
    }
    edits.invoiceRows = [...existingByNumero.values()];

    await saveOrdersCache(env, cache);
    await env.PIGNUS_TOKENS.put(EDITS_KEY, JSON.stringify(edits));

    return json({ ml_updated: mlUpdated, ml_overwritten: mlOverwritten, invoices_added: invoicesAdded, invoices_replaced: invoicesReplaced });
  } catch (err) {
    return errorResponse(500, err.message);
  }
}
