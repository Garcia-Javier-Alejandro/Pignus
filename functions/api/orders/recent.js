import { errorResponse, json, requireAdmin } from '../../_lib/http.js';
import { fetchRecentPaidOrders } from '../../_lib/meliOrders.js';
import { OUTPUT_HEADERS, transformOrdersToRows } from '../../_lib/transform.js';

export async function onRequestGet({ request, env }) {
  const authError = await requireAdmin(request, env);

  if (authError) {
    return authError;
  }

  try {
    const orders = await fetchRecentPaidOrders(env, 30);
    const rows = transformOrdersToRows(orders);

    return json({ headers: OUTPUT_HEADERS, rows });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
