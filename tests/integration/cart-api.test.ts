/**
 * Integration tests for Cart API
 * Tests complete request/response cycle through Express
 */

import request from 'supertest';
import express from 'express';
import { SalesforceCartClient } from '../../src/clients/salesforce-cart-client';
import { CartService } from '../../src/services/cart-service';
import { createCartRouter } from '../../src/routes/cart-routes';

describe('Cart API Integration Tests', () => {
  let app: express.Application;
  let sfClient: SalesforceCartClient;
  let cartService: CartService;

  beforeEach(() => {
    // Create fresh instances for each test
    app = express();
    app.use(express.json());

    sfClient = new SalesforceCartClient();
    cartService = new CartService(sfClient);

    app.use('/api/v1/cart', createCartRouter(cartService));
  });

  describe('POST /api/v1/cart - Create Cart', () => {
    it('should create a new cart and return 201', async () => {
      const response = await request(app)
        .post('/api/v1/cart')
        .expect(201);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('cart');
      expect(response.body.cart.items).toEqual([]);
      expect(response.body.cart.total).toBe(0);
    });

    it('should create unique session IDs', async () => {
      const response1 = await request(app).post('/api/v1/cart');
      const response2 = await request(app).post('/api/v1/cart');

      expect(response1.body.sessionId).not.toBe(response2.body.sessionId);
    });
  });

  describe('GET /api/v1/cart/:sessionId - Get Cart', () => {
    it('should return cart for valid session', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const response = await request(app)
        .get(`/api/v1/cart/${sessionId}`)
        .expect(200);

      expect(response.body.sessionId).toBe(sessionId);
      expect(response.body.cart).toBeDefined();
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/v1/cart/invalid_session')
        .expect(404);

      expect(response.body.error).toBe('CartNotFound');
    });
  });

  describe('POST /api/v1/cart/:sessionId/items - Add Item', () => {
    it('should add item to cart and return 200', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const response = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_mobile_plan_5g',
          name: '5G Unlimited Plan',
          price: 75.00,
          quantity: 1,
        })
        .expect(200);

      expect(response.body.cart.items).toHaveLength(1);
      expect(response.body.cart.items[0]).toMatchObject({
        productId: 'prod_mobile_plan_5g',
        name: '5G Unlimited Plan',
        price: 75.00,
        quantity: 1,
      });
      expect(response.body.cart.total).toBe(75.00);
    });

    it('should add multiple items to cart', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product 1',
          price: 100,
          quantity: 1,
        });

      const response = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_002',
          name: 'Product 2',
          price: 200,
          quantity: 2,
        })
        .expect(200);

      expect(response.body.cart.items).toHaveLength(2);
      expect(response.body.cart.total).toBe(500); // 100 + (200 * 2)
    });

    it('should return 400 for missing required fields', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const response = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          // missing name, price, quantity
        })
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should return 400 for invalid price', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const response = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product',
          price: -10,
          quantity: 1,
        })
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .post('/api/v1/cart/invalid_session/items')
        .send({
          productId: 'prod_001',
          name: 'Product',
          price: 100,
          quantity: 1,
        })
        .expect(404);

      expect(response.body.error).toBe('CartNotFound');
    });
  });

  describe('DELETE /api/v1/cart/:sessionId/items/:itemId - Remove Item', () => {
    it('should remove item from cart', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const addResponse = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product',
          price: 100,
          quantity: 1,
        });

      const itemId = addResponse.body.cart.items[0].id;

      const response = await request(app)
        .delete(`/api/v1/cart/${sessionId}/items/${itemId}`)
        .expect(200);

      expect(response.body.cart.items).toHaveLength(0);
      expect(response.body.cart.total).toBe(0);
    });

    it('should return 404 for non-existent item', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const response = await request(app)
        .delete(`/api/v1/cart/${sessionId}/items/invalid_item`)
        .expect(404);

      expect(response.body.error).toBe('ItemNotFound');
    });
  });

  describe('PUT /api/v1/cart/:sessionId/items/:itemId - Update Item', () => {
    it('should update item quantity', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const addResponse = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product',
          price: 50,
          quantity: 1,
        });

      const itemId = addResponse.body.cart.items[0].id;

      const response = await request(app)
        .put(`/api/v1/cart/${sessionId}/items/${itemId}`)
        .send({ quantity: 3 })
        .expect(200);

      expect(response.body.cart.items[0].quantity).toBe(3);
      expect(response.body.cart.total).toBe(150);
    });

    it('should return 400 for invalid quantity', async () => {
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      const addResponse = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product',
          price: 50,
          quantity: 1,
        });

      const itemId = addResponse.body.cart.items[0].id;

      const response = await request(app)
        .put(`/api/v1/cart/${sessionId}/items/${itemId}`)
        .send({ quantity: 0 })
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });
  });

  // CRITICAL INTEGRATION TEST: Context Expiry and Recovery
  describe('Context Expiry and Automatic Recovery', () => {
    it('should transparently handle context expiry when adding items', async () => {
      // Create cart and add initial item
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Initial Product',
          price: 100,
          quantity: 1,
        });

      // Get the cart to find the context
      const getResponse = await request(app).get(`/api/v1/cart/${sessionId}`);
      const contextId = getResponse.body.cart.id.replace('cart_', '');

      // Manually expire the Salesforce context
      sfClient.expireContext(contextId);

      // Add another item - should trigger recovery and succeed
      const response = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_002',
          name: 'New Product',
          price: 200,
          quantity: 1,
        })
        .expect(200);

      // Verify both items are present after recovery
      expect(response.body.cart.items).toHaveLength(2);
      expect(response.body.cart.total).toBe(300);
      expect(response.body.cart.items.find((item: any) => item.productId === 'prod_001')).toBeDefined();
      expect(response.body.cart.items.find((item: any) => item.productId === 'prod_002')).toBeDefined();
    });

    it('should transparently handle context expiry when getting cart', async () => {
      // Create cart and add items
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_001',
          name: 'Product 1',
          price: 50,
          quantity: 2,
        });

      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_002',
          name: 'Product 2',
          price: 100,
          quantity: 1,
        });

      // Get cart to find context
      const cart1 = await request(app).get(`/api/v1/cart/${sessionId}`);
      const contextId = cart1.body.cart.id.replace('cart_', '');

      // Expire the context
      sfClient.expireContext(contextId);

      // Get cart again - should trigger recovery
      const response = await request(app)
        .get(`/api/v1/cart/${sessionId}`)
        .expect(200);

      // Verify all items are preserved
      expect(response.body.cart.items).toHaveLength(2);
      expect(response.body.cart.total).toBe(200); // (50 * 2) + (100 * 1)
    });

    it('should handle complete cart workflow with context expiry', async () => {
      // Create cart
      const createResponse = await request(app).post('/api/v1/cart');
      const sessionId = createResponse.body.sessionId;

      // Add item 1
      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_mobile_plan',
          name: '5G Plan',
          price: 75,
          quantity: 1,
        });

      // Add item 2
      const addResponse = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_device',
          name: 'iPhone',
          price: 1299,
          quantity: 1,
        });

      // Expire context
      const contextId = addResponse.body.cart.id.replace('cart_', '');
      sfClient.expireContext(contextId);

      // Add item 3 after expiry
      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_accessory',
          name: 'Case',
          price: 29,
          quantity: 1,
        })
        .expect(200);

      // Get final cart
      const finalResponse = await request(app)
        .get(`/api/v1/cart/${sessionId}`)
        .expect(200);

      // All items should be present
      expect(finalResponse.body.cart.items).toHaveLength(3);
      expect(finalResponse.body.cart.total).toBe(1403); // 75 + 1299 + 29
    });
  });

  describe('Complete User Journey', () => {
    it('should support a complete shopping flow', async () => {
      // 1. Create cart
      const createResponse = await request(app)
        .post('/api/v1/cart')
        .expect(201);

      const sessionId = createResponse.body.sessionId;

      // 2. Add multiple items
      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_plan_5g',
          name: '5G Unlimited Plan',
          price: 75.00,
          quantity: 1,
        })
        .expect(200);

      await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_iphone_15',
          name: 'iPhone 15 Pro',
          price: 1299.00,
          quantity: 1,
        })
        .expect(200);

      const addResponse = await request(app)
        .post(`/api/v1/cart/${sessionId}/items`)
        .send({
          productId: 'prod_case',
          name: 'Phone Case',
          price: 49.00,
          quantity: 2,
        })
        .expect(200);

      expect(addResponse.body.cart.total).toBe(1472.00); // 75 + 1299 + (49 * 2)

      // 3. Update item quantity
      const caseItem = addResponse.body.cart.items.find(
        (item: any) => item.productId === 'prod_case'
      );

      await request(app)
        .put(`/api/v1/cart/${sessionId}/items/${caseItem.id}`)
        .send({ quantity: 1 })
        .expect(200);

      // 4. Get cart
      const getResponse = await request(app)
        .get(`/api/v1/cart/${sessionId}`)
        .expect(200);

      expect(getResponse.body.cart.total).toBe(1423.00); // 75 + 1299 + 49

      // 5. Remove an item
      const planItem = getResponse.body.cart.items.find(
        (item: any) => item.productId === 'prod_plan_5g'
      );

      const finalResponse = await request(app)
        .delete(`/api/v1/cart/${sessionId}/items/${planItem.id}`)
        .expect(200);

      expect(finalResponse.body.cart.items).toHaveLength(2);
      expect(finalResponse.body.cart.total).toBe(1348.00); // 1299 + 49
    });
  });
});
