/**
 * Unit tests for SalesforceCartClient
 * Tests realistic Salesforce behavior including context expiry
 */

import { SalesforceCartClient } from '../../src/clients/salesforce-cart-client';
import { ContextExpiredError, ItemNotFoundError } from '../../src/errors';
import { CartItemInput } from '../../src/types';

describe('SalesforceCartClient', () => {
  let client: SalesforceCartClient;

  beforeEach(() => {
    client = new SalesforceCartClient();
  });

  describe('createContext', () => {
    it('should create a context with unique ID', async () => {
      const context1 = await client.createContext();
      const context2 = await client.createContext();

      expect(context1.id).toBeDefined();
      expect(context2.id).toBeDefined();
      expect(context1.id).not.toBe(context2.id);
    });

    it('should create context with 30-minute expiration', async () => {
      const beforeCreate = Date.now();
      const context = await client.createContext();
      const afterCreate = Date.now();

      const expectedExpiry = beforeCreate + (30 * 60 * 1000);
      const expiryTime = context.expiresAt.getTime();

      // Allow small time difference for test execution
      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry);
      expect(expiryTime).toBeLessThanOrEqual(afterCreate + (30 * 60 * 1000));
    });

    it('should initialize context with empty cart', async () => {
      const context = await client.createContext();
      const cart = await client.getCart(context.id);

      expect(cart.items).toEqual([]);
      expect(cart.total).toBe(0);
    });
  });

  describe('addItem', () => {
    it('should add item to cart when context is valid', async () => {
      const context = await client.createContext();
      const item: CartItemInput = {
        productId: 'prod_001',
        name: '5G Plan',
        price: 75.00,
        quantity: 1,
      };

      const cart = await client.addItem(context.id, item);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        productId: 'prod_001',
        name: '5G Plan',
        price: 75.00,
        quantity: 1,
      });
      expect(cart.items[0].id).toBeDefined();
      expect(cart.total).toBe(75.00);
    });

    it('should generate unique item IDs', async () => {
      const context = await client.createContext();
      const item: CartItemInput = {
        productId: 'prod_001',
        name: 'Product',
        price: 10,
        quantity: 1,
      };

      const cart1 = await client.addItem(context.id, item);
      const cart2 = await client.addItem(context.id, item);

      expect(cart2.items).toHaveLength(2);
      expect(cart2.items[0].id).not.toBe(cart2.items[1].id);
    });

    it('should calculate total correctly with multiple items', async () => {
      const context = await client.createContext();

      await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Plan',
        price: 75.00,
        quantity: 2,
      });

      const cart = await client.addItem(context.id, {
        productId: 'prod_002',
        name: 'Device',
        price: 500.00,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(2);
      expect(cart.total).toBe(650.00); // (75 * 2) + (500 * 1)
    });

    it('should throw ContextExpiredError when context has expired', async () => {
      const context = await client.createContext();

      // Manually expire the context using test helper
      client.expireContext(context.id);

      const item: CartItemInput = {
        productId: 'prod_001',
        name: 'Product',
        price: 10,
        quantity: 1,
      };

      await expect(client.addItem(context.id, item))
        .rejects.toThrow(ContextExpiredError);
    });

    it('should throw ContextExpiredError for non-existent context', async () => {
      const item: CartItemInput = {
        productId: 'prod_001',
        name: 'Product',
        price: 10,
        quantity: 1,
      };

      await expect(client.addItem('invalid_context', item))
        .rejects.toThrow(ContextExpiredError);
    });
  });

  describe('getCart', () => {
    it('should return cart with items when context is valid', async () => {
      const context = await client.createContext();
      await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 2,
      });

      const cart = await client.getCart(context.id);

      expect(cart.items).toHaveLength(1);
      expect(cart.total).toBe(200);
    });

    it('should throw ContextExpiredError when context has expired', async () => {
      const context = await client.createContext();
      client.expireContext(context.id);

      await expect(client.getCart(context.id))
        .rejects.toThrow(ContextExpiredError);
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart when context is valid', async () => {
      const context = await client.createContext();
      const cart1 = await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 1,
      });

      const itemId = cart1.items[0].id;
      const cart2 = await client.removeItem(context.id, itemId);

      expect(cart2.items).toHaveLength(0);
      expect(cart2.total).toBe(0);
    });

    it('should recalculate total after removing item', async () => {
      const context = await client.createContext();

      await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 1,
      });

      const cart = await client.addItem(context.id, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 50,
        quantity: 1,
      });

      const itemId = cart.items[0].id;
      const updatedCart = await client.removeItem(context.id, itemId);

      expect(updatedCart.items).toHaveLength(1);
      expect(updatedCart.total).toBe(50);
    });

    it('should throw ItemNotFoundError when item does not exist', async () => {
      const context = await client.createContext();

      await expect(client.removeItem(context.id, 'invalid_item'))
        .rejects.toThrow(ItemNotFoundError);
    });

    it('should throw ContextExpiredError when context has expired', async () => {
      const context = await client.createContext();
      const cart = await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 1,
      });

      const itemId = cart.items[0].id;
      client.expireContext(context.id);

      await expect(client.removeItem(context.id, itemId))
        .rejects.toThrow(ContextExpiredError);
    });
  });

  describe('updateItem', () => {
    it('should update item quantity when context is valid', async () => {
      const context = await client.createContext();
      const cart1 = await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 50,
        quantity: 1,
      });

      const itemId = cart1.items[0].id;
      const cart2 = await client.updateItem(context.id, itemId, 3);

      expect(cart2.items[0].quantity).toBe(3);
      expect(cart2.total).toBe(150); // 50 * 3
    });

    it('should throw ItemNotFoundError when item does not exist', async () => {
      const context = await client.createContext();

      await expect(client.updateItem(context.id, 'invalid_item', 5))
        .rejects.toThrow(ItemNotFoundError);
    });

    it('should throw ContextExpiredError when context has expired', async () => {
      const context = await client.createContext();
      const cart = await client.addItem(context.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 50,
        quantity: 1,
      });

      const itemId = cart.items[0].id;
      client.expireContext(context.id);

      await expect(client.updateItem(context.id, itemId, 3))
        .rejects.toThrow(ContextExpiredError);
    });
  });

  describe('context expiry behavior', () => {
    it('should maintain separate state per context', async () => {
      const context1 = await client.createContext();
      const context2 = await client.createContext();

      await client.addItem(context1.id, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 1,
      });

      await client.addItem(context2.id, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 200,
        quantity: 1,
      });

      const cart1 = await client.getCart(context1.id);
      const cart2 = await client.getCart(context2.id);

      expect(cart1.items).toHaveLength(1);
      expect(cart1.total).toBe(100);
      expect(cart2.items).toHaveLength(1);
      expect(cart2.total).toBe(200);
    });

    it('should allow operations on valid context after another expires', async () => {
      const context1 = await client.createContext();
      const context2 = await client.createContext();

      // Expire only context1
      client.expireContext(context1.id);

      // context1 operations should fail
      await expect(client.getCart(context1.id))
        .rejects.toThrow(ContextExpiredError);

      // context2 operations should still work
      const cart = await client.addItem(context2.id, {
        productId: 'prod_001',
        name: 'Product',
        price: 50,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(1);
    });
  });
});
