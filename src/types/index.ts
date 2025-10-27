/**
 * Type definitions for Telecom Cart API
 */

// Salesforce Cart Context
export interface CartContext {
  id: string;           // Salesforce context identifier
  expiresAt: Date;      // Timestamp when context becomes unusable
}

// Input for adding items to cart
export interface CartItemInput {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

// Cart item with generated ID
export interface CartItem {
  id: string;           // Generated item identifier
  productId: string;    // Product catalog reference
  name: string;         // Display name
  price: number;        // Unit price
  quantity: number;     // Number of units
}

// Cart representation
export interface Cart {
  id: string;           // Cart identifier (matches session)
  items: CartItem[];    // All items in cart
  total: number;        // Sum of (price * quantity) for all items
}

// Session cart with Salesforce context mapping
export interface SessionCart {
  sessionId: string;        // Client-facing session identifier
  sfContextId: string;      // Current Salesforce context ID
  items: CartItem[];        // Source of truth for cart items
  createdAt: Date;          // Session creation timestamp
  lastAccessed: Date;       // Last operation timestamp
}

// Salesforce Cart Client Interface
export interface ISalesforceCartClient {
  createContext(): Promise<CartContext>;
  addItem(contextId: string, item: CartItemInput): Promise<Cart>;
  getCart(contextId: string): Promise<Cart>;
  removeItem(contextId: string, itemId: string): Promise<Cart>;
  updateItem(contextId: string, itemId: string, quantity: number): Promise<Cart>;
}

// Cart Service Interface
export interface ICartService {
  createCart(): Promise<{ sessionId: string; cart: Cart }>;
  getCart(sessionId: string): Promise<Cart>;
  addItem(sessionId: string, item: CartItemInput): Promise<Cart>;
  removeItem(sessionId: string, itemId: string): Promise<Cart>;
  updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart>;
}
