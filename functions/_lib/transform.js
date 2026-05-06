const toNumber = (value) => Number(value || 0);
const normalize = (value = '') => String(value).toLowerCase();

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

export function summarizeOrder(order) {
  const payments = order.payments || [];
  const pago = calculateProductRevenue(order, payments);
  const recargoMp = calculateMercadoPagoFee(order, payments);
  const retencionIibb = sumFeeDetails(payments, isIibbFee);
  const impSirtac = sumFeeDetails(payments, isSirtacFee);
  const costoEnvio = sumPaymentsField(payments, 'shipping_cost') || toNumber(order.shipping?.cost);
  const netReceivedAmount = sumPaymentsField(payments, 'net_received_amount');
  const neto = pago - (recargoMp + retencionIibb + impSirtac + costoEnvio);

  return {
    order_id: String(order.id || ''),
    date_created: order.date_created,
    status: order.status,
    buyer_name: `${order.buyer?.first_name || ''} ${order.buyer?.last_name || ''}`.trim(),
    localidad: order.shipping?.receiver_address?.city?.name || '',
    payments_count: payments.length,
    fee_details_count: payments.reduce((total, payment) => total + (payment.fee_details || []).length, 0),
    financial_row: {
      pago,
      recargo_mp: recargoMp,
      retencion_iibb: retencionIibb,
      imp_sirtac: impSirtac,
      costo_envio: costoEnvio,
      neto,
      net_received_amount: netReceivedAmount,
      validacion_neto: neto - netReceivedAmount,
    },
    payments: payments.map((payment) => ({
      status: payment.status,
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
    })),
  };
}
