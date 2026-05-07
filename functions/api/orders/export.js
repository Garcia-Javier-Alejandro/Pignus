import { errorResponse, json, requireAdmin } from '../../_lib/http.js';
import { fetchAllPaidOrders } from '../../_lib/meliOrders.js';
import { appendRows, getExistingOrderIds } from '../../_lib/sheets.js';
import { OUTPUT_HEADERS, transformOrdersToRows } from '../../_lib/transform.js';

export async function onRequestPost({ request, env }) {
  const authError = await requireAdmin(request, env);

  if (authError) {
    return authError;
  }

  try {
    const existingOrderIds = await getExistingOrderIds(env);
    const orders = await fetchAllPaidOrders(env);
    const newOrders = orders.filter((order) => !existingOrderIds.has(String(order.id)));
    const transformedRows = transformOrdersToRows(newOrders);
    const rows = existingOrderIds.size === 0
      ? [OUTPUT_HEADERS, ...transformedRows]
      : transformedRows;
    const result = await appendRows(env, rows);

    return json({
      exported_rows: newOrders.length,
      skipped_existing: orders.length - newOrders.length,
      included_header: existingOrderIds.size === 0 && newOrders.length > 0,
      sheet_name: env.SHEET_NAME || 'Ventas',
      google_updated_rows: result.updates?.updatedRows || rows.length,
    });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
