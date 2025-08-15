// This line allows us to use the .env file
require('dotenv').config();

const express = require('express');
// This securely reads your secret key from the .env file
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// This reads your website URL from the .env file for local testing
const YOUR_LIVE_WEBSITE_URL = process.env.YOUR_LIVE_WEBSITE_URL || `http://localhost:${PORT}`;

// Middleware to serve static files from the 'public' directory
app.use(express.static('public'));
// Middleware to parse JSON bodies
app.use(express.json());

// --- ROUTES ---

// Route to serve the main index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. CREATE CHECKOUT SESSION
app.post('/checkout', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Bass Fretboard Trainer - Pro Access',
                        description: 'Lifetime access to all pro features and lessons.'
                    },
                    unit_amount: 1999, // This is in cents, so $19.99
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${YOUR_LIVE_WEBSITE_URL}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_LIVE_WEBSITE_URL}`,
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error("Error creating checkout session:", error.message);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});


// 2. VERIFY PURCHASE
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
        console.error("Error retrieving Stripe session:", error.message);
        return res.status(500).json({ success: false, error: 'Invalid session ID or server error.' });
    }
});


// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));