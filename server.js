    // Load environment variables from .env file
    require('dotenv').config();

    const express = require('express');
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const path = require('path');
    const cors = require('cors');
    const { Pool } = require('pg'); // Import PostgreSQL client

    const app = express();
    const PORT = process.env.PORT || 3000;

    // --- IMPORTANT: Configure your frontend's live URL here ---
    const YOUR_LIVE_WEBSITE_URL = process.env.YOUR_LIVE_WEBSITE_URL || 'http://localhost:8080';

    // =============================================================
    // !!! CRITICAL: POSTGRESQL DATABASE INTEGRATION !!!
    // Initialize PostgreSQL connection pool
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL, // Render automatically provides this for managed PostgreSQL
      ssl: {
        rejectUnauthorized: false // Required for Render's PostgreSQL connections
      }
    });

    // Test database connection
    pool.connect((err, client, release) => {
      if (err) {
        return console.error('Error acquiring client', err.stack);
      }
      client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
          return console.error('Error executing query', err.stack);
        }
        console.log('PostgreSQL connected:', result.rows[0].now);
      });
    });

    // Function to ensure the 'users' table exists
    async function ensureUsersTable() {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            is_pro BOOLEAN DEFAULT FALSE
          );
        `);
        console.log('Users table ensured to exist.');
      } catch (error) {
        console.error('Error ensuring users table:', error);
      }
    }
    // Call this function when the server starts
    ensureUsersTable();

    // --- Middleware ---
    app.use(cors({
      origin: YOUR_LIVE_WEBSITE_URL,
      credentials: true,
    }));
    app.use(express.json());

    // Serve static files from the 'public' directory
    app.use(express.static('public'));

    // Serve app's index.html for the root route
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    /**
     * Endpoint to check a user's Pro status from the PERSISTENT DATABASE.
     */
    app.get('/user-status', async (req, res) => {
      const userId = req.headers['x-user-id'] || 'anonymous_user';

      try {
        // Fetch user's Pro status from PostgreSQL
        const result = await pool.query('SELECT is_pro FROM users WHERE id = $1', [userId]);
        const isPro = result.rows.length > 0 ? result.rows[0].is_pro : false;

        console.log(`User ${userId} requested status: isPro = ${isPro}`);
        res.json({ isPro: isPro });
      } catch (error) {
        console.error(`Error fetching user status for ${userId}:`, error);
        res.status(500).json({ error: "Internal server error during status fetch." });
      }
    });

    /**
     * Creates a Stripe Checkout Session dynamically.
     */
    app.post('/checkout', async (req, res) => {
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
          const userId = session.metadata.userId;
          
          // Save/update user's Pro status in PostgreSQL
          await pool.query(
            'INSERT INTO users (id, is_pro) VALUES ($1, TRUE) ON CONFLICT (id) DO UPDATE SET is_pro = TRUE;',
            [userId]
          );
          console.log(`User ${userId} is now Pro! Status updated in PostgreSQL.`);

          return res.json({ success: true, isPro: true, message: 'Payment verified.' });
        } else {
          return res.json({ success: false, error: 'Payment not successful.' });
        }
      } catch (error) {
        console.error('Error retrieving Stripe session or updating DB:', error.message);
        return res.status(500).json({ success: false, error: 'Invalid session ID or server error.' });
      }
    });

    // Start the server
    app.listen(PORT, () => console.log(`Backend server listening on http://localhost:${PORT}`));
    
