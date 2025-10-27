# SPEC-A-ARCHITECTURE.md

# Architecture Spec: Telecom Cart Experience API

## Overview

This API provides a persistent cart experience on top of Salesforce's non-persistent cart contexts. The core challenge is handling Salesforce context expiry (30 minutes) transparently, ensuring clients never experience disruption.

## Core Components

### 1. SalesforceCartClient (Test Double)

A simulated Salesforce cart API that mimics real behavior including context expiry.

**Behavior:**
- Contexts are created with a 30-minute expiration from creation time
- All operations check context expiry before execution
- Throws `ContextExpiredError` when operations are attempted on expired contexts
- Contexts cannot be refreshed or extended - only replaced
- No automatic cleanup - expired contexts remain in memory but are unusable

**Methods:**
```typescript
interface ISalesforceCartClient {
  createContext(): Promise<CartContext>;
  addItem(contextId: string, item: CartItemInput): Promise<Cart>;
  getCart(contextId: string): Promise<Cart>;
  removeItem(contextId: string, itemId: string): Promise<Cart>;
  updateItem(contextId: string, itemId: string, quantity: number): Promise<Cart>;
}
```

**Key Implementation Notes:**
- Store contexts in-memory with their expiration timestamps
- Before any operation, check if `Date.now() > context.expiresAt`
- Each context maintains its own cart state (items array)

### 2. CartService (Orchestration Layer)

The heart of the system - manages the mapping between client sessions and Salesforce contexts, with automatic recovery from context expiry.

**Responsibilities:**
- Create and manage session IDs (client-facing)
- Map session IDs to Salesforce context IDs (internal)
- Maintain authoritative cart state in-memory (source of truth)
- Detect context expiry and perform transparent recovery
- Delegate all cart operations to SalesforceCartClient

**Key Principle: Lazy Context Renewal**
- Don't preemptively refresh contexts
- Let operations fail with ContextExpiredError
- Recover by creating new context and migrating items
- Retry the original operation
- This is transparent to the client

**Core Methods:**
```typescript
interface ICartService {
  createCart(): Promise<{ sessionId: string; cart: Cart }>;
  getCart(sessionId: string): Promise<Cart>;
  addItem(sessionId: string, item: CartItemInput): Promise<Cart>;
  removeItem(sessionId: string, itemId: string): Promise<Cart>;
  updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart>;
}
```

### 3. In-Memory Store

Simple Map-based storage for session management.

**Structure:**
```typescript
Map<sessionId: string, SessionCart>
```

**Purpose:**
- Acts as source of truth for cart items during recovery
- Enables context recreation with full cart state
- Tracks session metadata for monitoring

## Data Models

### CartContext
```typescript
interface CartContext {
  id: string;           // Salesforce context identifier
  expiresAt: Date;      // Timestamp when context becomes unusable
}
```

### CartItemInput
```typescript
interface CartItemInput {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}
```

### CartItem
```typescript
interface CartItem {
  id: string;           // Generated item identifier
  productId: string;    // Product catalog reference
  name: string;         // Display name
  price: number;        // Unit price
  quantity: number;     // Number of units
}
```

### Cart
```typescript
interface Cart {
  id: string;           // Cart identifier (matches session)
  items: CartItem[];    // All items in cart
  total: number;        // Sum of (price * quantity) for all items
}
```

### SessionCart
```typescript
interface SessionCart {
  sessionId: string;        // Client-facing session identifier
  sfContextId: string;      // Current Salesforce context ID
  items: CartItem[];        // Source of truth for cart items
  createdAt: Date;          // Session creation timestamp
  lastAccessed: Date;       // Last operation timestamp (optional)
}
```

## Error Types

### ContextExpiredError
```typescript
class ContextExpiredError extends Error {
  constructor(contextId: string) {
    super(`Salesforce context ${contextId} has expired`);
    this.name = 'ContextExpiredError';
  }
}
```

### CartNotFoundError
```typescript
class CartNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Cart session ${sessionId} not found`);
    this.name = 'CartNotFoundError';
  }
}
```

### ItemNotFoundError
```typescript
class ItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} not found in cart`);
    this.name = 'ItemNotFoundError';
  }
}
```

## Context Recovery Strategy

### The Challenge

Salesforce contexts expire after 30 minutes. When a context expires mid-session, 
operations will fail. The system must recover transparently without client disruption.

### Recovery Approach

**Lazy Recovery** (chosen approach):
- Attempt operation with current context
- If ContextExpiredError is thrown, trigger recovery
- Recovery process: create new context, migrate cart state, retry operation
- Client receives successful response, unaware of recovery

**Why not proactive refresh?**
- Simpler implementation (no background timers)
- Better scalability (no periodic checks)
- More realistic (mirrors actual Salesforce API behavior)

### Recovery Requirements

1. **Source of Truth**: SessionCart maintains authoritative cart state
   - Survives context expiry
   - Used to rebuild cart in new contexts

2. **State Migration**: When recovery is needed:
   - Create new Salesforce context
   - Replay all items from SessionCart into new context
   - Update session-to-context mapping

3. **Error Handling**:
   - Successful recovery → Return success to client (transparent)
   - Failed recovery → Return 409 Conflict (client may retry)

4. **Idempotency**: Operations should be safe to retry after recovery

### Key Design Decision

The separation between **session** (client-facing, long-lived) and **context** 
(Salesforce, 30-min lifetime) enables recovery:

- Sessions persist in memory with full cart state
- Contexts are ephemeral and replaceable
- When context expires, create new one from session state
- Client continues using same session ID throughout

## Design Principles

### 1. Separation of Concerns
- **SalesforceCartClient**: Simulates external system with realistic expiry behavior
- **CartService**: Orchestrates operations and handles recovery logic
- **Express Routes**: Manages HTTP contract and error translation

### 2. Single Source of Truth
- SessionCart holds authoritative cart state
- Salesforce context is ephemeral storage that can be recreated
- Session state outlives any individual context

### 3. Simplicity
- In-memory storage (no database complexity)
- Lazy recovery (no background jobs)
- Reactive error handling (no prediction logic)

## Known Limitations (Acceptable for this scope)

1. **No Session Expiry**: Sessions live forever in memory
2. **No Concurrency Control**: Simultaneous operations on same session may conflict
3. **No Persistence**: Server restart loses all sessions
4. **In-Memory Only**: Not suitable for distributed deployments

## Testing Strategy

### Unit Tests - SalesforceCartClient
- Context creation with 30-minute expiry
- Operations succeed on valid contexts
- Operations throw ContextExpiredError on expired contexts
- Cart state maintained per context

### Unit Tests - CartService
- Session management (create, lookup)
- Delegation to SalesforceClient
- **Context recovery flow** (critical test)
- Error propagation

### Integration Tests
- Full HTTP request/response cycle
- All CRUD endpoints
- **End-to-end recovery scenario** (context expires, automatic recovery, success)

## File Structure

```
src/
├── types/
│   └── index.ts              # All TypeScript interfaces and types
├── errors/
│   └── index.ts              # Custom error classes
├── clients/
│   └── salesforce-cart-client.ts  # Test double
├── services/
│   └── cart-service.ts       # Orchestration logic
├── routes/
│   └── cart-routes.ts        # Express route handlers
└── index.ts                  # App entry point

tests/
├── clients/
│   └── salesforce-cart-client.test.ts
├── services/
│   └── cart-service.test.ts
└── integration/
    └── cart-api.test.ts
```
