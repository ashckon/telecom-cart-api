/**
 * Telecom Cart Experience API
 * Main application entry point
 */

import express from 'express';
import { SalesforceCartClient } from './clients/salesforce-cart-client';
import { CartService } from './services/cart-service';
import { createCartRouter } from './routes/cart-routes';

const PORT = process.env.PORT || 3000;

// Initialize application
const app = express();

// Middleware
app.use(express.json());

// Initialize services
const sfClient = new SalesforceCartClient();
const cartService = new CartService(sfClient);

// Routes
app.use('/api/v1/cart', createCartRouter(cartService));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Telecom Cart API listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base URL: http://localhost:${PORT}/api/v1/cart`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export { app, server };
