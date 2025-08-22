// Load env
require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const cors = require('cors'); // Import the cors middleware

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: Configure your frontend's live URL here ---
// This is used for CORS and Stripe redirect URLs.
// You MUST set this as an environment variable on Render for your backend service.
const YOUR_LIVE_WEBSITE_URL = process.env.YOUR_LIVE_WEBSITE_URL || 'http://localhost:8080'; // Default for local testing

// --- In-memory "Database" for User Pro Status ---
// In a real application, you would replace this with a proper persistent database
// (e.g., PostgreSQL, MongoDB, etc.) connected to your Render service.
// This simple object will store user IDs and their Pro status across server restarts
// if you were using a persistent DB. For now, it's in-memory and will reset on server restart.
const usersDb = {}; // { 'user_session_id_123': { isPro: true } }

// --- Middleware ---
// Configure CORS to allow requests from your frontend domain.
// Replace 'YOUR_LIVE_WEBSITE_URL' with the actual domain where your frontend is hosted (e.g., from Cloudflare).
app.use(cors({
  origin: YOUR_LIVE_WEBSITE_URL, // Allow requests from your frontend
  credentials: true, // Allow cookies to be sent with requests (if you implement session management)
}));
app.use(express.json()); // To parse JSON request bodies

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Serve app's index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * NEW: Endpoint to check a user's Pro status.
 * The frontend will call this on load to determine access.
 */
app.get('/user-status', (req, res) => {
  // --- User Identification ---
  // The frontend sends an 'X-User-Id' header. In a real app, this would be
  // a secure session ID or authenticated user ID.
  const userId = req.headers['x-user-id'] || 'anonymous_user'; // Fallback if header is missing

  const user = usersDb[userId];
  const isPro = user ? user.isPro : false;

  console.log(`User ${userId} requested status: isPro = ${isPro}`);
  res.json({ isPro: isPro });
});


/**
 * MODIFIED: Creates a Stripe Checkout Session dynamically.
 * This replaces the hardcoded payment link.
 */
app.post('/checkout', async (req, res) => {
  // --- User Identification ---
  // Get the user ID from the frontend. This is crucial for linking the purchase.
  const userId = req.headers['x-user-id'] || 'anonymous_user'; // Fallback if header is missing

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Bass Note Master Pro',
              description: 'Unlock all lessons and advanced game features.',
            },
            unit_amount: 1999, // $19.99
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Dynamically set success/cancel URLs based on the frontend's origin
      success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/`,
      metadata: {
        userId: userId, // Store user ID in Stripe metadata for webhook processing
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * MODIFIED: Verifies purchase and updates user's Pro status persistently.
 * This endpoint is called by the frontend after Stripe redirect.
 * In a production setup, you would also configure a Stripe Webhook to call this
 * (or a separate webhook handler) to ensure robust payment confirmation.
 */
app.post('/verify-purchase', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID is required.' });
  }
  console.log(`Verifying Stripe session: ${sessionId}`);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const userId = session.metadata.userId; // Retrieve user ID from metadata
      
      // --- IMPORTANT: Update User's Pro Status in Your PERSISTENT Database ---
      // For this example, we're using an in-memory object.
      // REPLACE THIS LINE with your actual database update logic:
      usersDb[userId] = { isPro: true }; 
      console.log(`User ${userId} is now Pro! Status updated in DB (in-memory).`);

      return res.json({ success: true, isPro: true, message: 'Payment verified.' });
    } else {
      return res.json({ success: false, error: 'Payment not successful.' });
    }
  } catch (error) {
    console.error('Error retrieving Stripe session:', error.message);
    return res.status(500).json({ success: false, error: 'Invalid session ID or server error.' });
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
