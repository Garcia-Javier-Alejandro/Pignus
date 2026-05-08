// recent orders endpoint
import { errorResponse, json, requireAdmin } from '../../_lib/http.js';
import { enrichOrders, fetchBillingTaxes, fetchRecentPaidOrders } from '../../_lib/meliOrders.js';
import { OUTPUT_HEADERS, transformOrdersToRows } from '../../_lib/transform.js';

export async function onRequestGet({ request, env }) {
  const authError = await requireAdmin(request, env);

  if (authError) {
    return authError;
  }

  try {
    const recent = await fetchRecentPaidOrders(env, 20);
    recent.sort((a, b) => (b.date_created > a.date_created ? 1 : -1));

    if (recent.length === 0) {
      const { access_token } = await (await import('../../_lib/meliAuth.js')).getStoredTokens(env);
      const meRes = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { accept: 'application/json', authorization: `Bearer ${access_token}` },
      });
      const meData = await meRes.json();
      return json({ headers: OUTPUT_HEADERS, rows: [], _debug_orders: recent._debug, _debug_me: { status: meRes.status, id: meData.id, nickname: meData.nickname, seller_reputation: meData.seller_reputation?.level_id } });
    }

    const orders = await enrichOrders(recent, env);

    // Fetch IIBB/SIRTAC for all orders in one billing API call, then inject per order.
    const { taxes: billingTaxes, _debug: billingDebug } = await fetchBillingTaxes(orders, env);
    for (const order of orders) {
      const tax = billingTaxes.get(String(order.id));
      if (tax) { order._iibb = tax.iibb; order._sirtac = tax.sirtac; }
    }

    const rows = transformOrdersToRows(orders);
    return json({ headers: OUTPUT_HEADERS, rows, _billing: billingDebug });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
