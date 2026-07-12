import 'dotenv/config';

const BREVO_API_KEY    = process.env.BREVO_API_KEY;
const SENDER_EMAIL     = process.env.BREVO_SENDER_EMAIL;
const NOTIFY_EMAIL     = process.env.ORDER_NOTIFY_EMAIL;

console.log('Testing Brevo REST API...');
console.log('  API key:', BREVO_API_KEY ? BREVO_API_KEY.slice(0, 12) + '...' : 'NOT SET');
console.log('  From:  ', SENDER_EMAIL);
console.log('  To:    ', NOTIFY_EMAIL);

if (!BREVO_API_KEY) { console.error('✗ BREVO_API_KEY is not set in .env'); process.exit(1); }

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    'accept': 'application/json',
    'api-key': BREVO_API_KEY,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    sender: { name: 'Matter Delivery', email: SENDER_EMAIL },
    to: [{ email: NOTIFY_EMAIL }],
    subject: 'Test — Matter Delivery Brevo integration',
    htmlContent: '<p>If you received this, the Brevo API integration is working correctly.</p>',
  }),
});

const body = await res.json();
if (res.ok) {
  console.log('✓ Email sent — Message ID:', body.messageId);
} else {
  console.error('✗ Failed:', JSON.stringify(body, null, 2));
}
