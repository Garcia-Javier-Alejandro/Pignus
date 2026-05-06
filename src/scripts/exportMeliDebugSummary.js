import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchPaidOrders } from '../services/ordersService.js';
import { transformOrder } from '../services/transformService.js';

const outputPath = path.resolve(process.cwd(), 'public/debug/orders-summary.json');

const toPaymentSummary = (payment) => ({
  id: payment.id,
  status: payment.status,
  status_detail: payment.status_detail,
  payment_type: payment.payment_type,
  payment_method_id: payment.payment_method_id,
  transaction_amount: payment.transaction_amount,
  total_paid_amount: payment.total_paid_amount,
  shipping_cost: payment.shipping_cost,
  net_received_amount: payment.net_received_amount,
  fee_details: (payment.fee_details || []).map((fee) => ({
    type: fee.type,
    name: fee.name,
    description: fee.description,
    amount: fee.amount ?? fee.fee_amount,
  })),
});

const toOrderSummary = (order) => {
  const transformed = transformOrder(order);

  return {
    order_id: String(order.id || ''),
    date_created: order.date_created,
    status: order.status,
    buyer: {
      first_name: order.buyer?.first_name,
      last_name: order.buyer?.last_name,
    },
    shipping: {
      id: order.shipping?.id,
      status: order.shipping?.status,
      cost: order.shipping?.cost,
      city: order.shipping?.receiver_address?.city?.name,
    },
    order_items: (order.order_items || []).map((item) => ({
      title: item.item?.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      full_unit_price: item.full_unit_price,
      sale_fee: item.sale_fee,
    })),
    payments: (order.payments || []).map(toPaymentSummary),
    financial_row: {
      orden_id: transformed[0],
      fecha: transformed[1],
      nombre: transformed[2],
      pago: transformed[3],
      recargo_mp: transformed[4],
      retencion_iibb: transformed[5],
      imp_sirtac: transformed[6],
      costo_envio: transformed[7],
      neto: transformed[8],
      localidad: transformed[9],
      validacion_neto: transformed[10],
    },
  };
};

const orders = await fetchPaidOrders();
const sampleSize = Number(process.env.MELI_DEBUG_SAMPLE_SIZE || 10);
const sample = orders.slice(0, sampleSize).map(toOrderSummary);

const payload = {
  generated_at: new Date().toISOString(),
  total_paid_orders_fetched: orders.length,
  sample_size: sample.length,
  notes: [
    'This file is generated locally from Mercado Libre API data.',
    'It is intended for validating field mappings before appending to Google Sheets.',
    'Do not commit this file if it contains private buyer/order information.',
  ],
  orders: sample,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.info(`Wrote Mercado Libre debug summary to ${outputPath}`);
