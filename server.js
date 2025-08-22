// Load environment variables from .env file
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
// Example: const YOUR_LIVE_WEBSITE_URL = 'https://your-frontend-domain.com';
const YOUR_LIVE_WEBSITE_URL = process.env.YOUR_LIVE_WEBSITE_URL || 'http://localhost:8080'; // Default for local testing

// =============================================================
// !!! CRITICAL: PERSISTENT DATABASE INTEGRATION REQUIRED !!!
// The 'usersDb' below is an IN-MEMORY object for demonstration.
// Data stored here WILL BE LOST on server restarts.
// You MUST replace the 'usersDb' interactions with calls to your
// actual persistent database (e.g., PostgreSQL, MongoDB, etc.).
// =============================================================
// Placeholder for a real database client (e.g., 'pg' for PostgreSQL, 'mongoose' for MongoDB)
// const { Pool } = require('pg'); // Example for PostgreSQL
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL, // Set DATABASE_URL env var on Render
// });

// Example in-memory "database" - REPLACE THIS WITH YOUR REAL DB
const usersDb = {}; // { 'user_session_id_123': { isPro: true } }

// --- Middleware ---
// Configure CORS to allow requests from your frontend domain.
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
 * Endpoint to check a user's Pro status from the PERSISTENT DATABASE.
 * The frontend calls this on load to determine access.
 */
app.get('/user-status', async (req, res) => {
  // The frontend sends an 'X-User-Id' header for anonymous user identification.
  // In a real app with login, this would be a secure session ID or authenticated user ID.
  const userId = req.headers['x-user-id'] || 'anonymous_user';

  try {
    // <--- IMPORTANT: REPLACE THIS with logic to fetch user's Pro status from your REAL DB
    // Example for PostgreSQL:
    // const result = await pool.query('SELECT is_pro FROM users WHERE id = $1', [userId]);
    // const isPro = result.rows.length > 0 ? result.rows[0].is_pro : false;

    // Currently using in-memory fallback:
    const user = usersDb[userId];
    const isPro = user ? user.isPro : false;

    console.log(`User ${userId} requested status: isPro = ${isPro}`);
    res.json({ isPro: isPro });
  } catch (error) {
    console.error(`Error fetching user status for ${userId}:`, error);
    res.status(500).json({ error: "Internal server error during status fetch." });
  }
});

/**
 * Creates a Stripe Checkout Session dynamically.
 * This replaces any hardcoded payment links.
 */
app.post('/checkout', async (req, res) => {
  // Get the user ID from the frontend. This is crucial for linking the purchase.
  const userId = req.headers['x-user-id'] || 'anonymous_user';

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
 * Verifies purchase and updates user's Pro status in the PERSISTENT DATABASE.
 * This endpoint is called by the frontend after Stripe redirect.
 * In a robust production setup, you would also configure a Stripe Webhook to call this
 * (or a separate webhook handler) to ensure payment confirmation even if the user
 * closes their browser before redirect.
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
      
      // <--- IMPORTANT: REPLACE THIS with logic to save/update user's Pro status in your REAL DB
      // Example for PostgreSQL:
      // await pool.query('INSERT INTO users (id, is_pro) VALUES ($1, TRUE) ON CONFLICT (id) DO UPDATE SET is_pro = TRUE', [userId]);

      // Currently using in-memory fallback:
      usersDb[userId] = { isPro: true }; 
      console.log(`User ${userId} is now Pro! Status updated in DB (in-memory fallback).`);

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
app.listen(PORT, () => console.log(`Backend server listening on http://localhost:${PORT}`));
