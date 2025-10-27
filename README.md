# Telecom Cart Experience API

A RESTful API that provides a persistent cart experience on top of Salesforce's non-persistent cart contexts. The key feature is transparent handling of Salesforce context expiry (30 minutes), ensuring clients never experience disruption.

## Architecture Overview

This API implements a **thin Experience Layer** pattern with three main components:

1. **SalesforceCartClient** (Test Double) - Simulates Salesforce cart API with realistic 30-minute context expiry
2. **CartService** (Orchestration Layer) - Manages session-to-context mapping and performs transparent context recovery
3. **Express Routes** - RESTful HTTP endpoints following the API spec

### Key Design Principle: Lazy Context Renewal

The system doesn't preemptively refresh contexts. Instead:
- Operations fail with `ContextExpiredError` when a context expires
- CartService catches the error and performs recovery:
  1. Creates a new Salesforce context
  2. Migrates all items from in-memory source of truth
  3. Updates the session mapping
  4. Retries the original operation
- The client receives a successful response, unaware of the recovery

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Install dependencies
npm install
```

### Running the API

```bash
# Development mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start
```

The API will start on `http://localhost:3000` (default).

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

**Test Results:**
- 53 total tests
- 19 tests for SalesforceCartClient
- 17 tests for CartService (including critical recovery scenarios)
- 17 integration tests for the complete API

## API Documentation

### Base URL

```
http://localhost:3000/api/v1/cart
```

### Endpoints

#### 1. Create Cart

**POST** `/`

Creates a new cart session.

**Response:** `201 Created`
```json
{
  "sessionId": "sess_abc123xyz",
  "cart": {
    "id": "cart_abc123xyz",
    "items": [],
    "total": 0
  }
}
```

---

#### 2. Get Cart

**GET** `/:sessionId`

Retrieves the current cart state.

**Response:** `200 OK`
```json
{
  "sessionId": "sess_abc123xyz",
  "cart": {
    "id": "cart_abc123xyz",
    "items": [
      {
        "id": "item_001",
        "productId": "prod_mobile_plan_5g",
        "name": "5G Unlimited Plan",
        "price": 75.00,
        "quantity": 1
      }
    ],
    "total": 75.00
  }
}
```

**Error:** `404 Not Found` if session doesn't exist

---

#### 3. Add Item

**POST** `/:sessionId/items`

Adds an item to the cart.

**Request Body:**
```json
{
  "productId": "prod_mobile_plan_5g",
  "name": "5G Unlimited Plan",
  "price": 75.00,
  "quantity": 1
}
```

**Response:** `200 OK` (same format as Get Cart)

**Errors:**
- `400 Bad Request` - Invalid/missing fields
- `404 Not Found` - Session doesn't exist
- `409 Conflict` - Context recovery failed (rare)

---

#### 4. Remove Item

**DELETE** `/:sessionId/items/:itemId`

Removes an item from the cart.

**Response:** `200 OK` (same format as Get Cart)

**Errors:**
- `404 Not Found` - Session or item doesn't exist
- `409 Conflict` - Context recovery failed (rare)

---

#### 5. Update Item Quantity

**PUT** `/:sessionId/items/:itemId`

Updates the quantity of an item.

**Request Body:**
```json
{
  "quantity": 3
}
```

**Response:** `200 OK` (same format as Get Cart)

**Errors:**
- `400 Bad Request` - Invalid quantity
- `404 Not Found` - Session or item doesn't exist
- `409 Conflict` - Context recovery failed (rare)

## Example Usage

```bash
# Create a cart
curl -X POST http://localhost:3000/api/v1/cart

# Response: { "sessionId": "sess_xyz", "cart": { ... } }

# Add an item
curl -X POST http://localhost:3000/api/v1/cart/sess_xyz/items \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_mobile_plan_5g",
    "name": "5G Unlimited Plan",
    "price": 75.00,
    "quantity": 1
  }'

# Get cart
curl http://localhost:3000/api/v1/cart/sess_xyz

# Remove an item
curl -X DELETE http://localhost:3000/api/v1/cart/sess_xyz/items/item_001

# Update item quantity
curl -X PUT http://localhost:3000/api/v1/cart/sess_xyz/items/item_001 \
  -H "Content-Type: application/json" \
  -d '{ "quantity": 3 }'
```

## Context Recovery in Action

The system transparently handles Salesforce context expiry:

```bash
# Time T+0: Create cart and add item
POST /api/v1/cart
# Returns: sessionId = sess_abc

POST /api/v1/cart/sess_abc/items
# Body: { "productId": "prod_001", "name": "Plan", "price": 50, "quantity": 1 }
# Response: 200 OK (fast)

# Time T+35min: Context expired internally, add another item
POST /api/v1/cart/sess_abc/items
# Body: { "productId": "prod_002", "name": "Device", "price": 500, "quantity": 1 }
# Response: 200 OK (slightly slower - recovery happened automatically)
# Client sees normal success, unaware of recovery

GET /api/v1/cart/sess_abc
# Returns both items with total = 550
```

## Project Structure

```
src/
├── types/
│   └── index.ts              # TypeScript interfaces and types
├── errors/
│   └── index.ts              # Custom error classes
├── clients/
│   └── salesforce-cart-client.ts  # Test double with context expiry
├── services/
│   └── cart-service.ts       # Orchestration with recovery logic
├── routes/
│   └── cart-routes.ts        # Express route handlers
└── index.ts                  # Application entry point

tests/
├── clients/
│   └── salesforce-cart-client.test.ts  # Unit tests for test double
├── services/
│   └── cart-service.test.ts            # Unit tests including recovery
└── integration/
    └── cart-api.test.ts                # Full API integration tests
```

## Key Implementation Details

### Source of Truth

The `SessionCart` in-memory store is the source of truth for cart items:
- Salesforce contexts are ephemeral and replaceable
- During recovery, items are migrated from `SessionCart.items` to the new context
- This ensures no data loss during context expiry

### Context Expiry Simulation

The `SalesforceCartClient` test double simulates real Salesforce behavior:
- Contexts expire exactly 30 minutes after creation
- All operations check `Date.now() > context.expiresAt`
- Expired contexts throw `ContextExpiredError`
- Includes `expireContext(id)` helper for testing

### Recovery Flow

When a `ContextExpiredError` is caught:
1. Create new Salesforce context
2. Migrate all items: `for (item of session.items) sfClient.addItem(newContext.id, item)`
3. Update session mapping: `session.sfContextId = newContext.id`
4. Retry original operation
5. Return success to client

## Known Limitations & Tradeoffs

These are acceptable for the current scope:

1. **No Session Expiry** - Sessions live forever in memory
2. **No Concurrency Control** - Simultaneous operations on same session may conflict
3. **No Persistence** - Server restart loses all sessions
4. **In-Memory Only** - Not suitable for distributed/multi-instance deployments
5. **Item ID Mapping** - After recovery, item IDs change (but productIds remain constant)

## Testing Strategy

### Unit Tests (36 tests)
- **SalesforceCartClient** (19 tests): Context creation, expiry behavior, CRUD operations
- **CartService** (17 tests): Session management, delegation, **critical recovery flows**

### Integration Tests (17 tests)
- Full HTTP request/response cycle
- All endpoints (create, get, add, remove, update)
- **Context expiry with automatic recovery** (most important tests)
- Complete user journey scenarios

### Critical Recovery Tests

The following tests prove the recovery mechanism works:
- `should transparently recover from expired context on getCart`
- `should transparently recover from expired context on addItem`
- `should transparently recover from expired context on removeItem`
- `should handle multiple context expirations and recoveries`
- `should maintain session state across context changes`

## Development Notes

### Adding Logging

The current implementation uses `console.log` for simplicity. To add structured logging:
```typescript
// Replace console.log with your logger
import logger from './logger';
logger.info('Successfully recovered context', { sessionId });
```

### Environment Variables

Configure via environment variables:
```bash
PORT=3000  # API port (default: 3000)
```

### TypeScript Compilation

```bash
# Compile TypeScript to dist/
npm run build

# Type checking only
npx tsc --noEmit
```

## Production Considerations

The current implementation prioritizes correctness and clarity of the context 
recovery mechanism. For production deployment, these enhancements would be necessary:

- **Persistent storage** - Replace in-memory store with Redis or database
- **Session management** - Add expiration and automatic cleanup of stale sessions
- **Horizontal scaling** - Shared state solution for multi-instance deployments
- **Observability** - Structured logging and metrics for recovery operations

These were intentionally deferred to focus on proving the core recovery logic works correctly.


## Support

For issues or questions:
- Review the specs: `spec_a_architecture.md` and `spec_b_api.md`
- Check the test files for usage examples
- Examine the console logs for recovery events
