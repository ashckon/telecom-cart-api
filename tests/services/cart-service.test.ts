/**
 * Unit tests for CartService
 * Tests orchestration logic and critical context recovery flow
 */

import { CartService } from '../../src/services/cart-service';
import { SalesforceCartClient } from '../../src/clients/salesforce-cart-client';
import { CartNotFoundError } from '../../src/errors';
import { CartItemInput } from '../../src/types';

describe('CartService', () => {
  let service: CartService;
  let sfClient: SalesforceCartClient;

  beforeEach(() => {
    sfClient = new SalesforceCartClient();
    service = new CartService(sfClient);
  });

  describe('createCart', () => {
    it('should create a new cart session with unique session ID', async () => {
      const result1 = await service.createCart();
      const result2 = await service.createCart();

      expect(result1.sessionId).toBeDefined();
      expect(result2.sessionId).toBeDefined();
      expect(result1.sessionId).not.toBe(result2.sessionId);
    });

    it('should return empty cart on creation', async () => {
      const result = await service.createCart();

      expect(result.cart.items).toEqual([]);
      expect(result.cart.total).toBe(0);
    });

    it('should create a Salesforce context internally', async () => {
      const result = await service.createCart();

      // Should be able to get the cart using the session
      const cart = await service.getCart(result.sessionId);
      expect(cart).toBeDefined();
    });
  });

  describe('getCart', () => {
    it('should return cart for existing session', async () => {
      const { sessionId } = await service.createCart();
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 1,
      });

      const cart = await service.getCart(sessionId);

      expect(cart.items).toHaveLength(1);
      expect(cart.total).toBe(100);
    });

    it('should throw CartNotFoundError for non-existent session', async () => {
      await expect(service.getCart('invalid_session'))
        .rejects.toThrow(CartNotFoundError);
    });
  });

  describe('addItem', () => {
    it('should add item to cart', async () => {
      const { sessionId } = await service.createCart();
      const item: CartItemInput = {
        productId: 'prod_001',
        name: '5G Plan',
        price: 75.00,
        quantity: 1,
      };

      const cart = await service.addItem(sessionId, item);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        productId: 'prod_001',
        name: '5G Plan',
        price: 75.00,
        quantity: 1,
      });
      expect(cart.total).toBe(75.00);
    });

    it('should add multiple items to cart', async () => {
      const { sessionId } = await service.createCart();

      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Plan',
        price: 75,
        quantity: 1,
      });

      const cart = await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'Device',
        price: 500,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(2);
      expect(cart.total).toBe(575);
    });

    it('should throw CartNotFoundError for non-existent session', async () => {
      await expect(service.addItem('invalid_session', {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 1,
      })).rejects.toThrow(CartNotFoundError);
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart', async () => {
      const { sessionId } = await service.createCart();
      const cart1 = await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product',
        price: 100,
        quantity: 1,
      });

      const itemId = cart1.items[0].id;
      const cart2 = await service.removeItem(sessionId, itemId);

      expect(cart2.items).toHaveLength(0);
      expect(cart2.total).toBe(0);
    });

    it('should throw CartNotFoundError for non-existent session', async () => {
      await expect(service.removeItem('invalid_session', 'item_001'))
        .rejects.toThrow(CartNotFoundError);
    });
  });

  describe('updateItem', () => {
    it('should update item quantity', async () => {
      const { sessionId } = await service.createCart();
      const cart1 = await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product',
        price: 50,
        quantity: 1,
      });

      const itemId = cart1.items[0].id;
      const cart2 = await service.updateItem(sessionId, itemId, 3);

      expect(cart2.items[0].quantity).toBe(3);
      expect(cart2.total).toBe(150);
    });
  });

  // CRITICAL TEST: Context Recovery
  describe('context recovery', () => {
    it('should transparently recover from expired context on getCart', async () => {
      // Create cart and add items
      const { sessionId } = await service.createCart();
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 2,
      });
      await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 50,
        quantity: 1,
      });

      // Manually expire the Salesforce context
      // We need to access the internal context ID - get it from a getCart call first
      const cartBefore = await service.getCart(sessionId);
      expect(cartBefore.items).toHaveLength(2);
      expect(cartBefore.total).toBe(250);

      // Expire the context by accessing sfClient directly
      // Get the context ID from the cart ID (cart_ctx_xxx format)
      const contextId = cartBefore.id.replace('cart_', '');
      sfClient.expireContext(contextId);

      // Now try to get the cart - should trigger recovery
      const cartAfter = await service.getCart(sessionId);

      // Verify cart state is preserved after recovery
      expect(cartAfter.items).toHaveLength(2);
      expect(cartAfter.total).toBe(250);
      expect(cartAfter.items[0].productId).toBe('prod_001');
      expect(cartAfter.items[0].quantity).toBe(2);
      expect(cartAfter.items[1].productId).toBe('prod_002');
      expect(cartAfter.items[1].quantity).toBe(1);
    });

    it('should transparently recover from expired context on addItem', async () => {
      // Create cart and add initial item
      const { sessionId } = await service.createCart();
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Existing Product',
        price: 100,
        quantity: 1,
      });

      // Get cart to find context ID
      const cart1 = await service.getCart(sessionId);
      const contextId = cart1.id.replace('cart_', '');

      // Expire the context
      sfClient.expireContext(contextId);

      // Add new item - should trigger recovery and succeed
      const cart2 = await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'New Product',
        price: 200,
        quantity: 1,
      });

      // Verify both items are present
      expect(cart2.items).toHaveLength(2);
      expect(cart2.total).toBe(300);
      expect(cart2.items.find(item => item.productId === 'prod_001')).toBeDefined();
      expect(cart2.items.find(item => item.productId === 'prod_002')).toBeDefined();
    });

    it('should transparently recover from expired context on removeItem', async () => {
      // Create cart and add items
      const { sessionId } = await service.createCart();
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 1,
      });
      const cart1 = await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 50,
        quantity: 1,
      });

      const itemToRemove = cart1.items[0];
      const contextId = cart1.id.replace('cart_', '');

      // Expire the context
      sfClient.expireContext(contextId);

      // Remove item - should trigger recovery and succeed
      const cart2 = await service.removeItem(sessionId, itemToRemove.id);

      // Verify one item was removed
      expect(cart2.items).toHaveLength(1);
      // The remaining item should be the one we didn't remove
      // Note: after recovery, item IDs change but productIds remain
      expect(cart2.items[0].productId).toBe(
        cart1.items[1].productId
      );
    });

    it('should handle multiple context expirations and recoveries', async () => {
      const { sessionId } = await service.createCart();

      // Add item 1
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 1,
      });

      // Expire and add item 2 (first recovery)
      let cart = await service.getCart(sessionId);
      sfClient.expireContext(cart.id.replace('cart_', ''));

      await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 200,
        quantity: 1,
      });

      // Expire and add item 3 (second recovery)
      cart = await service.getCart(sessionId);
      sfClient.expireContext(cart.id.replace('cart_', ''));

      const finalCart = await service.addItem(sessionId, {
        productId: 'prod_003',
        name: 'Product 3',
        price: 300,
        quantity: 1,
      });

      // All items should be present
      expect(finalCart.items).toHaveLength(3);
      expect(finalCart.total).toBe(600);
    });

    it('should maintain session state across context changes', async () => {
      const { sessionId } = await service.createCart();

      // Add items
      await service.addItem(sessionId, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 2,
      });

      // Expire context
      const cart1 = await service.getCart(sessionId);
      sfClient.expireContext(cart1.id.replace('cart_', ''));

      // Perform operation that triggers recovery
      await service.getCart(sessionId);

      // Add another item to verify new context works
      const finalCart = await service.addItem(sessionId, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 50,
        quantity: 1,
      });

      expect(finalCart.items).toHaveLength(2);
      expect(finalCart.total).toBe(250);
    });
  });

  describe('session management', () => {
    it('should maintain separate state for different sessions', async () => {
      const session1 = await service.createCart();
      const session2 = await service.createCart();

      await service.addItem(session1.sessionId, {
        productId: 'prod_001',
        name: 'Product 1',
        price: 100,
        quantity: 1,
      });

      await service.addItem(session2.sessionId, {
        productId: 'prod_002',
        name: 'Product 2',
        price: 200,
        quantity: 1,
      });

      const cart1 = await service.getCart(session1.sessionId);
      const cart2 = await service.getCart(session2.sessionId);

      expect(cart1.total).toBe(100);
      expect(cart2.total).toBe(200);
      expect(cart1.items[0].productId).toBe('prod_001');
      expect(cart2.items[0].productId).toBe('prod_002');
    });
  });
});
