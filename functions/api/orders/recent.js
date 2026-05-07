import { errorResponse, json, requireAdmin } from '../../_lib/http.js';
import { enrichOrders, fetchRecentPaidOrders } from '../../_lib/meliOrders.js';
import { OUTPUT_HEADERS, transformOrdersToRows } from '../../_lib/transform.js';

export async function onRequestGet({ request, env }) {
  const authError = await requireAdmin(request, env);

  if (authError) {
    return authError;
  }

  try {
    const recentOrders = await fetchRecentPaidOrders(env, 30);
    // Enrich with individual order fetch to get payments[].fee_details (absent in search results).
    const orders = await enrichOrders(recentOrders, env);
    const rows = transformOrdersToRows(orders);

    return json({ headers: OUTPUT_HEADERS, rows });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
