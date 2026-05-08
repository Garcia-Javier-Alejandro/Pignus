import { errorResponse, json, requireAdmin } from '../../_lib/http.js';
import { fetchLatestOrders } from '../../_lib/meliOrders.js';
import { fetchEnrichAndStore } from '../../_lib/fetchAndStore.js';

export async function onRequestGet({ request, env }) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  try {
    const { orders, total, fetchedOffset } = await fetchLatestOrders(env, 20);
    const result = await fetchEnrichAndStore(env, { orders, total, fetchedOffset, isOlderFetch: false });
    return json(result);
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
