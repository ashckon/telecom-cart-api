/**
 * CartService - Orchestration layer with transparent context recovery
 *
 * Responsibilities:
 * - Create and manage session IDs (client-facing)
 * - Map session IDs to Salesforce context IDs (internal)
 * - Maintain authoritative cart state in-memory (source of truth)
 * - Detect context expiry and perform transparent recovery
 * - Delegate all cart operations to SalesforceCartClient
 */

import { randomUUID } from 'crypto';
import {
  ISalesforceCartClient,
  ICartService,
  Cart,
  CartItemInput,
  SessionCart,
  CartItem,
} from '../types';
import {
  ContextExpiredError,
  CartNotFoundError,
  ContextRecoveryFailedError,
} from '../errors';

export class CartService implements ICartService {
  private sessions: Map<string, SessionCart> = new Map();

  constructor(private sfClient: ISalesforceCartClient) {}

  /**
   * Creates a new cart session with a fresh Salesforce context
   */
  async createCart(): Promise<{ sessionId: string; cart: Cart }> {
    const sessionId = `sess_${randomUUID()}`;
    const sfContext = await this.sfClient.createContext();

    const session: SessionCart = {
      sessionId,
      sfContextId: sfContext.id,
      items: [],
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.sessions.set(sessionId, session);

    const cart: Cart = {
      id: `cart_${sessionId}`,
      items: [],
      total: 0,
    };

    return { sessionId, cart };
  }

  /**
   * Retrieves the current cart for a session
   * Performs recovery if context has expired
   */
  async getCart(sessionId: string): Promise<Cart> {
    const session = this.getSession(sessionId);
    session.lastAccessed = new Date();

    try {
      return await this.sfClient.getCart(session.sfContextId);
    } catch (error) {
      if (error instanceof ContextExpiredError) {
        await this.recoverContext(session);
        return await this.sfClient.getCart(session.sfContextId);
      }
      throw error;
    }
  }

  /**
   * Adds an item to the cart
   * Performs recovery if context has expired
   */
  async addItem(sessionId: string, item: CartItemInput): Promise<Cart> {
    const session = this.getSession(sessionId);
    session.lastAccessed = new Date();

    try {
      const cart = await this.sfClient.addItem(session.sfContextId, item);
      // Update source of truth with the new item
      this.syncSessionItems(session, cart.items);
      return cart;
    } catch (error) {
      if (error instanceof ContextExpiredError) {
        await this.recoverContext(session);
        // Retry the original operation
        const cart = await this.sfClient.addItem(session.sfContextId, item);
        this.syncSessionItems(session, cart.items);
        return cart;
      }
      throw error;
    }
  }

  /**
   * Removes an item from the cart
   * Performs recovery if context has expired
   */
  async removeItem(sessionId: string, itemId: string): Promise<Cart> {
    const session = this.getSession(sessionId);
    session.lastAccessed = new Date();

    try {
      const cart = await this.sfClient.removeItem(session.sfContextId, itemId);
      // Update source of truth
      this.syncSessionItems(session, cart.items);
      return cart;
    } catch (error) {
      if (error instanceof ContextExpiredError) {
        await this.recoverContext(session);
        // After recovery, we need to find the item in the recovered cart
        // The itemId from the original context won't work in the new context
        // We need to find the item by productId in the session items
        const itemToRemove = session.items.find(item => item.id === itemId);
        if (!itemToRemove) {
          throw error; // Re-throw if item not found in session
        }
        // Find the new item ID in the recovered context
        const recoveredCart = await this.sfClient.getCart(session.sfContextId);
        const newItem = recoveredCart.items.find(
          item => item.productId === itemToRemove.productId
        );
        if (!newItem) {
          throw new ContextRecoveryFailedError(sessionId);
        }
        // Remove using the new item ID
        const cart = await this.sfClient.removeItem(session.sfContextId, newItem.id);
        this.syncSessionItems(session, cart.items);
        return cart;
      }
      throw error;
    }
  }

  /**
   * Updates the quantity of an item in the cart
   * Performs recovery if context has expired
   */
  async updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart> {
    const session = this.getSession(sessionId);
    session.lastAccessed = new Date();

    try {
      const cart = await this.sfClient.updateItem(session.sfContextId, itemId, quantity);
      // Update source of truth
      this.syncSessionItems(session, cart.items);
      return cart;
    } catch (error) {
      if (error instanceof ContextExpiredError) {
        await this.recoverContext(session);
        // Similar to removeItem, need to map old itemId to new itemId
        const itemToUpdate = session.items.find(item => item.id === itemId);
        if (!itemToUpdate) {
          throw error;
        }
        const recoveredCart = await this.sfClient.getCart(session.sfContextId);
        const newItem = recoveredCart.items.find(
          item => item.productId === itemToUpdate.productId
        );
        if (!newItem) {
          throw new ContextRecoveryFailedError(sessionId);
        }
        const cart = await this.sfClient.updateItem(session.sfContextId, newItem.id, quantity);
        this.syncSessionItems(session, cart.items);
        return cart;
      }
      throw error;
    }
  }

  /**
   * Helper: Get session or throw CartNotFoundError
   */
  private getSession(sessionId: string): SessionCart {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new CartNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Helper: Synchronize session items with cart items (source of truth)
   */
  private syncSessionItems(session: SessionCart, items: CartItem[]): void {
    session.items = [...items];
  }

  /**
   * Critical: Recover from context expiry by creating new context and migrating items
   *
   * Steps:
   * 1. Create new Salesforce context
   * 2. Migrate all items from session (source of truth) to new context
   * 3. Update session mapping to point to new context
   */
  private async recoverContext(session: SessionCart): Promise<void> {
    try {
      // Step 1: Create new context
      const newContext = await this.sfClient.createContext();

      // Step 2: Migrate all items from source of truth (session.items)
      for (const item of session.items) {
        await this.sfClient.addItem(newContext.id, {
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        });
      }

      // Step 3: Update session mapping
      session.sfContextId = newContext.id;

      console.log(`Successfully recovered context for session ${session.sessionId}`);
    } catch (error) {
      console.error(`Failed to recover context for session ${session.sessionId}:`, error);
      throw new ContextRecoveryFailedError(
        session.sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }
}
