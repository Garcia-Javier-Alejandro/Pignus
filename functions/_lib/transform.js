const toNumber = (value) => Number(value || 0);
const normalize = (value = '') => String(value).toLowerCase();

export const OUTPUT_HEADERS = [
  'Orden ID',
  'Fecha',
  'Nombre',
  'Pago',
  'Recargo MP',
  'Retencion IIBB',
  'Imp SIRTAC',
  'Costo Envio',
  'Neto',
  'Localidad',
];

const getFeeAmount = (fee) => toNumber(fee.amount ?? fee.fee_amount);

const isMercadoPagoFee = (fee) => {
  const text = `${fee.type || ''} ${fee.name || ''} ${fee.description || ''}`;
  const normalized = normalize(text);
  return normalized.includes('mercadopago_fee') || normalized.includes('cargo por venta');
};

const isIibbFee = (fee) => {
  const text = `${fee.type || ''} ${fee.name || ''} ${fee.description || ''}`;
  return normalize(text).includes('iibb') || normalize(text).includes('ingresos brutos');
};

const isSirtacFee = (fee) => {
  const text = `${fee.type || ''} ${fee.name || ''} ${fee.description || ''}`;
  return normalize(text).includes('sirtac');
};

const sumPaymentsField = (payments, field) => (
  payments.reduce((total, payment) => total + toNumber(payment[field]), 0)
);

const sumFeeDetails = (payments, predicate) => payments.reduce((total, payment) => {
  const feeDetails = payment.fee_details || [];
  return total + feeDetails
    .filter(predicate)
    .reduce((feeTotal, fee) => feeTotal + getFeeAmount(fee), 0);
}, 0);

const calculateProductRevenue = (order, payments) => {
  const productsTotal = (order.order_items || []).reduce((total, item) => {
    const quantity = toNumber(item.quantity || 1);
    const unitPrice = toNumber(item.unit_price ?? item.full_unit_price);
    return total + quantity * unitPrice;
  }, 0);

  return productsTotal || sumPaymentsField(payments, 'transaction_amount') || sumPaymentsField(payments, 'total_paid_amount');
};

const calculateMercadoPagoFee = (order, payments) => {
  const paymentFee = sumFeeDetails(payments, isMercadoPagoFee);
  return paymentFee || (order.order_items || []).reduce((total, item) => total + toNumber(item.sale_fee), 0);
};

export function transformOrderToRow(order) {
  const payments = order.payments || [];
  const pago = calculateProductRevenue(order, payments);
  const recargoMp = calculateMercadoPagoFee(order, payments);
  const retencionIibb = sumFeeDetails(payments, isIibbFee);
  const impSirtac = sumFeeDetails(payments, isSirtacFee);
  const costoEnvio = sumPaymentsField(payments, 'shipping_cost') || toNumber(order.shipping?.cost);
  const neto = pago - (recargoMp + retencionIibb + impSirtac + costoEnvio);

  return [
    String(order.id || ''),
    order.date_created || '',
    order.buyer?.nickname || `${order.buyer?.first_name || ''} ${order.buyer?.last_name || ''}`.trim(),
    pago,
    recargoMp,
    retencionIibb,
    impSirtac,
    costoEnvio,
    neto,
    order.shipping?.receiver_address?.city?.name || '',
  ];
}

export function transformOrdersToRows(orders) {
  return orders.map(transformOrderToRow);
}
