// Load env
require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const YOUR_LIVE_WEBSITE_URL =
  process.env.YOUR_LIVE_WEBSITE_URL || `http://localhost:${PORT}`;

// ✅ Hardcoded Payment Link URL
const PAYMENT_LINK_URL = 'https://buy.stripe.com/aFa3cu0OCermeInd0m3AY03';

app.use(express.static('public'));
app.use(express.json());

// Serve app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 1) START CHECKOUT — now just returns your Payment Link URL
 */
app.post('/checkout', (req, res) => {
  return res.json({ url: PAYMENT_LINK_URL });
});

/**
 * 2) VERIFY PURCHASE — unchanged
 *    Make sure your Payment Link's "Post-payment redirect" includes:
 *    https://your-domain.com?session_id={CHECKOUT_SESSION_ID}
 *    so the client can call this endpoint with that session_id.
 */
app.post('/verify-purchase', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID is required.' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      return res.json({ success: true, message: 'Payment verified.' });
    } else {
      return res.json({ success: false, error: 'Payment not successful.' });
    }
  } catch (error) {
    console.error('Error retrieving Stripe session:', error.message);
    return res.status(500).json({ success: false, error: 'Invalid session ID or server error.' });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
