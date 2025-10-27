# SPEC-B-API.md

# API Spec: Telecom Cart Experience API

## Overview

RESTful API for managing shopping carts with automatic handling of underlying context expiry. All operations are idempotent and safe to retry.

## Base URL

```
/api/v1/cart
```

## Authentication

None required for this implementation.

## Content Type

All requests and responses use `application/json`.

## Endpoints

### 1. Create Cart

**POST** `/`

Creates a new cart session. Returns a session ID that must be used for all subsequent operations.

**Request:**
- No body required

**Response:**

```typescript
201 Created

{
  "sessionId": string,
  "cart": {
    "id": string,
    "items": CartItem[],
    "total": number
  }
}
```

**Example:**

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

**Notes:**
- Session ID is generated server-side
- Initial cart is always empty
- Session has no expiration (within scope of this API)

---

### 2. Get Cart

**GET** `/:sessionId`

Retrieves the current state of a cart by session ID.

**Path Parameters:**
- `sessionId` (string, required): Session identifier from cart creation

**Response:**

```typescript
200 OK

{
  "sessionId": string,
  "cart": {
    "id": string,
    "items": CartItem[],
    "total": number
  }
}
```

**Example:**

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

**Error Responses:**

```typescript
404 Not Found

{
  "error": "CartNotFound",
  "message": "Cart session sess_invalid not found"
}
```

---

### 3. Add Item to Cart

**POST** `/:sessionId/items`

Adds a new item to the cart or increases quantity if the same product already exists.

**Path Parameters:**
- `sessionId` (string, required): Session identifier

**Request Body:**

```typescript
{
  "productId": string,    // Required: Product catalog identifier
  "name": string,         // Required: Display name
  "price": number,        // Required: Unit price (positive number)
  "quantity": number      // Required: Number of units (positive integer)
}
```

**Example Request:**

```json
{
  "productId": "prod_mobile_plan_5g",
  "name": "5G Unlimited Plan",
  "price": 75.00,
  "quantity": 1
}
```

**Response:**

```typescript
200 OK

{
  "sessionId": string,
  "cart": {
    "id": string,
    "items": CartItem[],
    "total": number
  }
}
```

**Example Response:**

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

**Error Responses:**

```typescript
404 Not Found

{
  "error": "CartNotFound",
  "message": "Cart session sess_invalid not found"
}
```

```typescript
409 Conflict

{
  "error": "ContextRecoveryFailed",
  "message": "Failed to recover from context expiry",
  "sessionId": "sess_abc123xyz"
}
```

**Notes:**
- Item ID is generated server-side
- Total is automatically calculated as sum of (price × quantity) for all items
- If context expiry occurs, recovery is automatic and transparent
- 409 responses are rare and indicate recovery failure

---

### 4. Remove Item from Cart

**DELETE** `/:sessionId/items/:itemId`

Removes an item completely from the cart regardless of quantity.

**Path Parameters:**
- `sessionId` (string, required): Session identifier
- `itemId` (string, required): Item identifier from cart items array

**Response:**

```typescript
200 OK

{
  "sessionId": string,
  "cart": {
    "id": string,
    "items": CartItem[],
    "total": number
  }
}
```

**Example Response:**

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

**Error Responses:**

```typescript
404 Not Found - Session doesn't exist

{
  "error": "CartNotFound",
  "message": "Cart session sess_invalid not found"
}
```

```typescript
404 Not Found - Item doesn't exist in cart

{
  "error": "ItemNotFound",
  "message": "Item item_999 not found in cart"
}
```

```typescript
409 Conflict - Context recovery failed

{
  "error": "ContextRecoveryFailed",
  "message": "Failed to recover from context expiry",
  "sessionId": "sess_abc123xyz"
}
```

---

### 5. Update Item Quantity (Optional - Stretch Goal)

**PUT** `/:sessionId/items/:itemId`

Updates the quantity of an existing item in the cart.

**Path Parameters:**
- `sessionId` (string, required): Session identifier
- `itemId` (string, required): Item identifier

**Request Body:**

```typescript
{
  "quantity": number    // Required: New quantity (positive integer)
}
```

**Example Request:**

```json
{
  "quantity": 3
}
```

**Response:**

```typescript
200 OK

{
  "sessionId": string,
  "cart": {
    "id": string,
    "items": CartItem[],
    "total": number
  }
}
```

**Error Responses:**

```typescript
404 Not Found - Session doesn't exist

{
  "error": "CartNotFound",
  "message": "Cart session sess_invalid not found"
}
```

```typescript
404 Not Found - Item doesn't exist

{
  "error": "ItemNotFound",
  "message": "Item item_999 not found in cart"
}
```

```typescript
409 Conflict - Context recovery failed

{
  "error": "ContextRecoveryFailed",
  "message": "Failed to recover from context expiry",
  "sessionId": "sess_abc123xyz"
}
```

**Implementation Note:**
- This endpoint can be implemented simply as: remove old item + add new item with updated quantity
- For time-boxed implementation, this is acceptable
- The core context recovery logic is already proven by add/remove operations

---

## Data Types

### CartItem

```typescript
interface CartItem {
  id: string;           // Server-generated unique identifier
  productId: string;    // Product catalog reference
  name: string;         // Display name for UI
  price: number;        // Unit price in dollars
  quantity: number;     // Number of units (positive integer)
}
```

**Example:**

```json
{
  "id": "item_001",
  "productId": "prod_mobile_plan_5g",
  "name": "5G Unlimited Plan",
  "price": 75.00,
  "quantity": 2
}
```

### Cart

```typescript
interface Cart {
  id: string;           // Cart identifier (typically matches session)
  items: CartItem[];    // Array of items in cart
  total: number;        // Sum of (price × quantity) for all items
}
```

**Example:**

```json
{
  "id": "cart_abc123xyz",
  "items": [
    {
      "id": "item_001",
      "productId": "prod_mobile_plan_5g",
      "name": "5G Unlimited Plan",
      "price": 75.00,
      "quantity": 2
    },
    {
      "id": "item_002",
      "productId": "prod_iphone_15",
      "name": "iPhone 15 Pro",
      "price": 1299.00,
      "quantity": 1
    }
  ],
  "total": 1449.00
}
```

---

## Error Response Format

All error responses follow this consistent structure:

```typescript
{
  "error": string,        // Error type/code (e.g., "CartNotFound")
  "message": string,      // Human-readable error description
  "sessionId"?: string    // Optional: Included when session exists but operation failed
}
```

### Error Types

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `CartNotFound` | 404 | Session ID doesn't exist |
| `ItemNotFound` | 404 | Item ID doesn't exist in the specified cart |
| `ContextRecoveryFailed` | 409 | Underlying Salesforce context expired and recovery failed |
| `ValidationError` | 400 | Request body validation failed (optional) |

---

## Context Expiry Behavior

**What the client sees:**
- All operations succeed normally, even when underlying context expires
- Response times may be slightly longer during recovery (multiple Salesforce calls)
- No special handling required by client

**What happens internally:**
1. Context expires after 30 minutes
2. Next operation detects expiry
3. New context is created automatically
4. All items are migrated to new context
5. Original operation completes successfully

**When 409 Conflict occurs:**
- Recovery process itself fails (rare)
- Client should retry the operation
- Session remains valid, next attempt may succeed

---

## Usage Examples

### Complete Flow: Create Cart and Add Items

```bash
# 1. Create a new cart
POST /api/v1/cart
Response: { "sessionId": "sess_abc", "cart": { "id": "cart_abc", "items": [], "total": 0 } }

# 2. Add first item
POST /api/v1/cart/sess_abc/items
Body: { "productId": "prod_001", "name": "5G Plan", "price": 75.00, "quantity": 1 }
Response: { "sessionId": "sess_abc", "cart": { ..., "total": 75.00 } }

# 3. Add second item
POST /api/v1/cart/sess_abc/items
Body: { "productId": "prod_002", "name": "iPhone 15", "price": 1299.00, "quantity": 1 }
Response: { "sessionId": "sess_abc", "cart": { ..., "total": 1374.00 } }

# 4. Get current cart
GET /api/v1/cart/sess_abc
Response: { "sessionId": "sess_abc", "cart": { ..., "total": 1374.00 } }

# 5. Remove first item
DELETE /api/v1/cart/sess_abc/items/item_001
Response: { "sessionId": "sess_abc", "cart": { ..., "total": 1299.00 } }
```

### Automatic Context Recovery (Transparent to Client)

```bash
# Time: T+0 - Create cart
POST /api/v1/cart
Response: { "sessionId": "sess_xyz", ... }

# Time: T+5min - Add item (context valid)
POST /api/v1/cart/sess_xyz/items
Body: { "productId": "prod_001", "name": "Plan", "price": 50, "quantity": 1 }
Response: 200 OK (fast response)

# Time: T+35min - Add another item (context expired internally)
POST /api/v1/cart/sess_xyz/items
Body: { "productId": "prod_002", "name": "Device", "price": 500, "quantity": 1 }
Response: 200 OK (slightly slower - recovery happened automatically)
# Client sees normal success, doesn't know recovery occurred
```

---

## Implementation Notes

### Required for MVP
- Create Cart (POST /)
- Get Cart (GET /:sessionId)
- Add Item (POST /:sessionId/items)
- Remove Item (DELETE /:sessionId/items/:itemId)

### Optional/Stretch
- Update Item Quantity (PUT /:sessionId/items/:itemId)
  - Can be implemented as remove + add if time permits
  - Not critical for proving context recovery logic

### Out of Scope
- Batch operations
- Cart merging
- Checkout/payment
- Inventory validation
- Price validation against product catalog
- Session expiration/cleanup
- Rate limiting
- Authentication/authorization
