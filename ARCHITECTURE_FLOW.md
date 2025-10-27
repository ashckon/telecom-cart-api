# Architecture Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│                    (HTTP Requests)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express Routes                             │
│              (cart-routes.ts)                               │
│  - POST /                  Create cart                       │
│  - GET /:sessionId         Get cart                         │
│  - POST /:sessionId/items  Add item                         │
│  - DELETE /:sessionId/...  Remove item                      │
│  - PUT /:sessionId/...     Update item                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   CartService                                │
│              (cart-service.ts)                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  In-Memory Store (Source of Truth)                 │    │
│  │  Map<sessionId, SessionCart>                       │    │
│  │    - sessionId                                      │    │
│  │    - sfContextId  ◄── Maps to SF context          │    │
│  │    - items[]      ◄── Authoritative cart state    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Recovery Logic:                                            │
│  1. Catch ContextExpiredError                              │
│  2. Create new SF context                                  │
│  3. Migrate items from SessionCart.items                   │
│  4. Update mapping                                          │
│  5. Retry operation                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              SalesforceCartClient                           │
│          (salesforce-cart-client.ts)                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Contexts: Map<contextId, ContextData>             │    │
│  │    - context: { id, expiresAt }                     │    │
│  │    - items: CartItem[]                              │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Behavior:                                                  │
│  - Expires contexts after 30 minutes                       │
│  - Throws ContextExpiredError on expired contexts          │
│  - Maintains cart state per context                        │
└─────────────────────────────────────────────────────────────┘
```

## Normal Operation Flow

```
Client Request: Add Item
         │
         ▼
    [Express Routes]
         │
         ▼
    [CartService.addItem(sessionId, item)]
         │
         ├─── Look up SessionCart by sessionId
         │
         ▼
    [sfClient.addItem(sfContextId, item)]
         │
         ├─── Context valid? ✅
         │
         ▼
    [Returns Cart with new item]
         │
         ├─── Update SessionCart.items
         │
         ▼
    [Return success to client]
```

## Recovery Flow (Context Expired)

```
Client Request: Add Item (Context Expired 5 min ago)
         │
         ▼
    [Express Routes]
         │
         ▼
    [CartService.addItem(sessionId, item)]
         │
         ├─── Look up SessionCart
         │    SessionCart.items = [item1, item2]  ◄── Source of Truth
         │    SessionCart.sfContextId = "ctx_expired"
         │
         ▼
    [sfClient.addItem("ctx_expired", item3)]
         │
         ├─── Check: Date.now() > expiresAt ❌
         │
         ▼
    [Throws ContextExpiredError]
         │
         ▼
    [CartService catches error]
         │
         ├─── RECOVERY STARTS
         │
         ▼
    [1. Create new context]
         │
         ├─── sfClient.createContext()
         │    Returns: { id: "ctx_new", expiresAt: now + 30min }
         │
         ▼
    [2. Migrate existing items from SessionCart.items]
         │
         ├─── for (item of [item1, item2]):
         │       sfClient.addItem("ctx_new", item)
         │
         ▼
    [3. Update session mapping]
         │
         ├─── SessionCart.sfContextId = "ctx_new"
         │
         ▼
    [4. Retry original operation]
         │
         ├─── sfClient.addItem("ctx_new", item3)
         │    Returns: Cart with [item1, item2, item3]
         │
         ▼
    [5. Update SessionCart.items]
         │
         ├─── SessionCart.items = [item1, item2, item3]
         │
         ▼
    [Return success to client with all items]
         │
         ▼
    Client receives: { items: [item1, item2, item3], total: 600 }

    ✅ Client never knew recovery happened
```

## Data Flow: Session vs Context

```
┌──────────────────────────────────────────────────────────┐
│                  Client-Facing Layer                      │
│                                                            │
│  Session ID: "sess_abc123"                                │
│  - Created once, never expires (in current scope)        │
│  - Client uses this for all operations                   │
│  - Maps to current Salesforce context                    │
└──────────────────────────────────────────────────────────┘
                         │
                         │ Maps to
                         ▼
┌──────────────────────────────────────────────────────────┐
│                 SessionCart (In-Memory)                   │
│                                                            │
│  sessionId: "sess_abc123"                                 │
│  sfContextId: "ctx_xyz789"  ◄── Changes on recovery      │
│  items: [                                                 │
│    { id: "item_1", productId: "prod_001", ... },         │
│    { id: "item_2", productId: "prod_002", ... }          │
│  ]  ◄── SOURCE OF TRUTH (survives context changes)       │
│  createdAt: 2024-10-26T10:00:00Z                         │
│  lastAccessed: 2024-10-26T10:45:00Z                      │
└──────────────────────────────────────────────────────────┘
                         │
                         │ References
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Salesforce Context (Ephemeral)               │
│                                                            │
│  Context ID: "ctx_xyz789"                                 │
│  expiresAt: 2024-10-26T10:30:00Z  ◄── 30 min expiry      │
│  items: [...]  ◄── Rebuilt from SessionCart on recovery  │
│                                                            │
│  Status at 10:35: EXPIRED ❌                              │
│  → Triggers recovery                                      │
│  → New context created: "ctx_new456"                      │
│  → SessionCart.sfContextId updated to "ctx_new456"        │
└──────────────────────────────────────────────────────────┘
```

## Timeline: Context Expiry and Recovery

```
Time  │ Event                           │ State
──────┼─────────────────────────────────┼──────────────────────────────
10:00 │ Client creates cart             │ Session: sess_abc
      │                                 │ Context: ctx_001 (expires 10:30)
      │                                 │ Items: []
──────┼─────────────────────────────────┼──────────────────────────────
10:05 │ Client adds item 1              │ Session: sess_abc
      │                                 │ Context: ctx_001 ✅ (valid)
      │                                 │ Items: [item1]
──────┼─────────────────────────────────┼──────────────────────────────
10:15 │ Client adds item 2              │ Session: sess_abc
      │                                 │ Context: ctx_001 ✅ (valid)
      │                                 │ Items: [item1, item2]
──────┼─────────────────────────────────┼──────────────────────────────
10:30 │ Context expires                 │ Session: sess_abc ✅ (still valid)
      │ (no client action)              │ Context: ctx_001 ❌ (expired)
      │                                 │ SessionCart.items: [item1, item2] ✅
──────┼─────────────────────────────────┼──────────────────────────────
10:35 │ Client adds item 3              │ 1. Try ctx_001 → EXPIRED ❌
      │ → Triggers recovery             │ 2. Create ctx_002 (expires 11:05)
      │                                 │ 3. Migrate: item1, item2 → ctx_002
      │                                 │ 4. Add: item3 → ctx_002
      │                                 │ 5. Update: sess_abc → ctx_002
      │                                 │
      │ Client receives success         │ Session: sess_abc ✅
      │                                 │ Context: ctx_002 ✅ (new, valid)
      │                                 │ Items: [item1, item2, item3]
──────┼─────────────────────────────────┼──────────────────────────────
10:40 │ Client gets cart                │ Session: sess_abc
      │                                 │ Context: ctx_002 ✅ (valid)
      │                                 │ Items: [item1, item2, item3]
      │                                 │ → No recovery needed
──────┼─────────────────────────────────┼──────────────────────────────
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Request                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ CartService  │
                  └──────┬───────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐   ┌──────────────┐   ┌──────────────┐
    │SessionOK│   │ Context OK   │   │ Context      │
    │         │   │              │   │ Expired      │
    └────┬────┘   └──────┬───────┘   └──────┬───────┘
         │               │                   │
         ▼               ▼                   ▼
    ╔════════╗      ╔════════╗         ╔═══════════╗
    ║ 200 OK ║      ║ 200 OK ║         ║ Recovery  ║
    ╚════════╝      ╚════════╝         ║  Process  ║
                                        ╚═════┬═════╝
         │               │                   │
         │               │      ┌────────────┼────────────┐
         │               │      ▼                         ▼
         │               │  ╔════════╗             ╔══════════╗
         │               │  ║ 200 OK ║             ║ 409      ║
         │               │  ║Success ║             ║ Conflict ║
         │               │  ╚════════╝             ╚══════════╝
         │               │      │                         │
         └───────────────┴──────┴─────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   Response   │
                  └──────────────┘

Special Cases:
- CartNotFoundError     → 404 Not Found
- ItemNotFoundError     → 404 Not Found
- ValidationError       → 400 Bad Request
- RecoveryFailed        → 409 Conflict
- Unknown Error         → 500 Internal Server Error
```

## Key Insight: Why Recovery Works

```
┌──────────────────────────────────────────────────────────────┐
│  The Magic: Separation of Session and Context                │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Session (Client-Facing)                                     │
│  ✅ Long-lived                                                │
│  ✅ Client identifier                                         │
│  ✅ Source of truth for items                                │
│  ✅ Survives context changes                                 │
│                                                               │
│  Context (Salesforce)                                        │
│  ⏰ 30-minute lifetime                                        │
│  🔄 Replaceable                                               │
│  📦 Ephemeral storage                                         │
│  ♻️  Can be recreated from session                           │
│                                                               │
│  When context expires:                                       │
│  1. Session still exists ✅                                   │
│  2. Session.items has all data ✅                            │
│  3. Create new context from session.items ✅                 │
│  4. Client never knows the difference ✅                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Testing Strategy Visual

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Pyramid                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                    ┌─────────────┐                          │
│                    │Integration  │  17 tests                │
│                    │  Tests      │  - Full HTTP cycle       │
│                    │             │  - Context recovery E2E  │
│                    └─────────────┘                          │
│                   ╱               ╲                          │
│                  ╱                 ╲                         │
│          ┌──────────────────────────────┐                   │
│          │    Service Tests             │  17 tests         │
│          │  - CartService               │  - Recovery logic │
│          │  - Session management        │  - Error handling │
│          └──────────────────────────────┘                   │
│         ╱                                ╲                   │
│        ╱                                  ╲                  │
│  ┌─────────────────────────────────────────────┐            │
│  │         Client Tests                        │  19 tests  │
│  │  - SalesforceCartClient                     │            │
│  │  - Context expiry                           │            │
│  │  - CRUD operations                          │            │
│  └─────────────────────────────────────────────┘            │
│                                                              │
│  Total: 53 tests - All passing ✅                           │
└─────────────────────────────────────────────────────────────┘
```
