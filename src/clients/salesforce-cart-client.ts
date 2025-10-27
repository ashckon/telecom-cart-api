/**
 * SalesforceCartClient - Test double simulating Salesforce cart API
 *
 * Mimics real Salesforce behavior including:
 * - 30-minute context expiration
 * - Context expiry validation on all operations
 * - In-memory cart state per context
 */

import { randomUUID } from 'crypto';
import {
  CartContext,
  CartItemInput,
  Cart,
  CartItem,
  ISalesforceCartClient
} from '../types';
import { ContextExpiredError, ItemNotFoundError } from '../errors';

interface ContextData {
  context: CartContext;
  items: CartItem[];
}

export class SalesforceCartClient implements ISalesforceCartClient {
  private contexts: Map<string, ContextData> = new Map();
  private readonly CONTEXT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
  private itemCounter = 0;

  /**
   * Creates a new Salesforce context with 30-minute expiration
   */
  async createContext(): Promise<CartContext> {
    const context: CartContext = {
      id: `ctx_${randomUUID()}`,
      expiresAt: new Date(Date.now() + this.CONTEXT_EXPIRY_MS),
    };

    this.contexts.set(context.id, {
      context,
      items: [],
    });

    return context;
  }

  /**
   * Adds an item to the cart in the specified context
   * Throws ContextExpiredError if context has expired
   */
  async addItem(contextId: string, item: CartItemInput): Promise<Cart> {
    const contextData = this.getValidContext(contextId);

    const cartItem: CartItem = {
      id: `item_${++this.itemCounter}`,
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    };

    contextData.items.push(cartItem);

    return this.buildCart(contextData);
  }

  /**
   * Retrieves the cart for the specified context
   * Throws ContextExpiredError if context has expired
   */
  async getCart(contextId: string): Promise<Cart> {
    const contextData = this.getValidContext(contextId);
    return this.buildCart(contextData);
  }

  /**
   * Removes an item from the cart
   * Throws ContextExpiredError if context has expired
   * Throws ItemNotFoundError if item doesn't exist
   */
  async removeItem(contextId: string, itemId: string): Promise<Cart> {
    const contextData = this.getValidContext(contextId);

    const itemIndex = contextData.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      throw new ItemNotFoundError(itemId);
    }

    contextData.items.splice(itemIndex, 1);

    return this.buildCart(contextData);
  }

  /**
   * Updates the quantity of an item in the cart
   * Throws ContextExpiredError if context has expired
   * Throws ItemNotFoundError if item doesn't exist
   */
  async updateItem(contextId: string, itemId: string, quantity: number): Promise<Cart> {
    const contextData = this.getValidContext(contextId);

    const item = contextData.items.find(item => item.id === itemId);
    if (!item) {
      throw new ItemNotFoundError(itemId);
    }

    item.quantity = quantity;

    return this.buildCart(contextData);
  }

  /**
   * Helper: Gets a context and validates it hasn't expired
   * Throws ContextExpiredError if expired or doesn't exist
   */
  private getValidContext(contextId: string): ContextData {
    const contextData = this.contexts.get(contextId);

    if (!contextData) {
      // Treat non-existent context as expired
      throw new ContextExpiredError(contextId);
    }

    // Check if context has expired
    if (Date.now() > contextData.context.expiresAt.getTime()) {
      throw new ContextExpiredError(contextId);
    }

    return contextData;
  }

  /**
   * Helper: Builds a Cart object from context data
   */
  private buildCart(contextData: ContextData): Cart {
    const total = contextData.items.reduce(
      (sum, item) => sum + (item.price * item.quantity),
      0
    );

    return {
      id: `cart_${contextData.context.id}`,
      items: [...contextData.items], // Return a copy
      total,
    };
  }

  /**
   * Test helper: Manually expire a context (for testing)
   * NOT part of the real Salesforce API
   */
  expireContext(contextId: string): void {
    const contextData = this.contexts.get(contextId);
    if (contextData) {
      // Set expiration to the past
      contextData.context.expiresAt = new Date(Date.now() - 1000);
    }
  }
}
