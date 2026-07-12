const NOTIFY_EMAIL  = process.env.ORDER_NOTIFY_EMAIL?.trim();
const BREVO_API_KEY = process.env.BREVO_API_KEY?.trim();
const SENDER_EMAIL  = (process.env.BREVO_SENDER_EMAIL || 'noreply@matternutrition.xyz').trim();
const SENDER_NAME   = (process.env.BREVO_SENDER_NAME  || 'Matter Delivery').trim();

export const sendNewOrderEmail = async ({ partner, order, lines, totalAmount }) => {
  if (!NOTIFY_EMAIL || !BREVO_API_KEY) {
    console.warn('[email] Skipped — BREVO_API_KEY or ORDER_NOTIFY_EMAIL not set');
    return;
  }

  const deliveryDate = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const deliveryTime = order.deliveryTime || '—';

  const itemRows = lines
    .map(l => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${l.itemName || l.menuItem?.name || '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${l.quantity}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">AED ${Number(l.unitPrice || 0).toFixed(2)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">AED ${Number(l.lineTotal || 0).toFixed(2)}</td>
      </tr>`)
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#4f46e5;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">New Order Received</h1>
        <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px">Matter Delivery Partner Portal</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px">Partner</td>
            <td style="padding:6px 0;font-weight:600">${partner.businessName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px">Contact</td>
            <td style="padding:6px 0">${partner.contactName} &bull; ${partner.email}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px">Delivery date</td>
            <td style="padding:6px 0;font-weight:600">${deliveryDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px">Delivery time</td>
            <td style="padding:6px 0">${deliveryTime}</td>
          </tr>
          ${order.notes ? `
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px">Notes</td>
            <td style="padding:6px 0">${order.notes}</td>
          </tr>` : ''}
        </table>

        <h3 style="margin:0 0 10px;font-size:14px;color:#374151">Order Items</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Item</th>
              <th style="padding:8px 12px;text-align:center;color:#6b7280;font-weight:600">Qty</th>
              <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600">Unit</th>
              <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr style="background:#f9fafb">
              <td colspan="3" style="padding:10px 12px;font-weight:700;text-align:right">Grand Total</td>
              <td style="padding:10px 12px;font-weight:700;text-align:right;color:#4f46e5">AED ${Number(totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: NOTIFY_EMAIL }],
      subject: `New Order — ${partner.businessName} (${deliveryDate})`,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
};
