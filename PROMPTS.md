


## Initial Prompt
You are working as a backend engineer. 

I need you to implement a thin Experience API layer for a telecom shopping cart that sits on top of Salesforce's cart contexts. The main challenge is that Salesforce contexts expire after 30 minutes, but we need to provide a seamless experience where users never encounter these expiry errors.

Read **SPEC-A-ARCHITECTURE.md** and **SPEC-B-API.md** attached carefully - they define the complete architecture, data models, and API contracts. 
- SPEC-A-ARCHITECTURE.md: Defines the layered architecture 
- SPEC-B-API.md - Defines the REST endpoints 

 **Key requirements:** 
- **TypeScript** on Node 20+ 
- **Express** for HTTP (keep it simple) 
- Use **Jest** for tests 
- `SalesforceCartClient` test double with 30-min context expiry (no real Salesforce calls) 
- `CartService` with transparent context recovery 
- In-memory storage only (no databases) 
- Focus on the 4 core endpoints (create, get, add, remove) 
- UPDATE endpoint is optional/stretch goal 

 **Implementation priority (must-have):**

 1. Type definitions and error classes 
 2. SalesforceCartClient test double with realistic context expiry behavior 
 3.  Unit tests for SalesforceCartClient proving expiry works 
 4.  implement CartService with context recovery logic 
 5.  Unit tests for CartService proving recovery works 
 6.  Express routes for the 4 core endpoints 

 *if time allows (optional):* 
- Update item endpoint 
- more test coverage 

 **SKIP and AVOID:** 
- Logging frameworks (console.log is fine) 
- Validation libraries (basic checks are enough)
-  Docker/deployment configs
-  Authentication 

 **Critical Requirements:**
 1. Context expiry must be realistic 
 2.  Recovery must be transparent. When facing context expired error, it shoud: 
	 - Create a new Salesforce context 
	 - Migrate all items from the session's in-memory state
	 - Update the session mapping
	 - Retry the original operation
	 -  Return success to the client 
 3.  Testing the recovery path. (Most important test) write at least one test that: 
	 - Creates a cart and adds items
	 - Manually advances time or expires the context
	 - Performs another operation 
	 -Verifies it succeeds after automatic recovery (You can use Jest's fake timers or just expose a way to manually expire contexts for testing) 

**A SUCCESSFUL implementation should:**
 Pass all tests including the recovery scenario 
 Have clean separation between Client/Service/Routes layers 
 Use proper TypeScript types (no any) 
 Handle the 404 and 409 error cases correctly 
 Have a README with setup/run/test commands 
 Be understandable by other engineers reading it 

**Start** by setting up the project structure and implementing the types/errors, then the `SalesforceCartClient` with tests. 

**Notes**: 
- Keep it simple - no over-engineering. 
- a Map<contextId, context> is fine for test double 
- The recovery mechanism is the critical path to prove. 
- Focus on correctness over cleverness - no hallucination -
- Document any tradeoffs or known gaps in the README

### Result
Implementation completed with all tests passing. **IMPLEMENTATION_SUMMARY.md**

### What I Accepted:

- **Initial project structure** - The proposed file organization with separate directories for types, errors, clients, services, and routes made logical sense
- **TypeScript configuration** - Standard tsconfig.json setup with strict mode enabled was appropriate
- **Jest configuration** - The test setup with ts-jest preset was correct for our needs
- **Core type definitions** - The interfaces in `types/index.ts` accurately represented the domain models from the spec
- **Custom error classes** - The four error types (ContextExpiredError, CartNotFoundError, ItemNotFoundError, ContextRecoveryFailedError) covered all necessary cases
- **SalesforceCartClient implementation** - The test double correctly simulated context expiry behavior with the 30-minute timeout
- **CartService recovery logic** - The core recovery mechanism (catch error, create context, migrate items, retry) was sound
- **Test coverage strategy** - The three-level testing approach (unit tests for client, unit tests for service, integration tests) was comprehensive
- **README structure** - The documentation format with setup instructions, API docs, and architecture explanation was clear

### What I Modified:

- **Express route handlers - Added explicit return statements**
  - Initially, response handlers used `res.status().json()` without return statements
  - Modified all response calls to use `return res.status().json()` pattern

- **Error class cause property**
  - Initial implementation had type errors with the `cause` property in ContextRecoveryFailedError
  - Added explicit property declaration: `cause?: Error;`
  - Removed incorrect `override` keyword that didn't exist in base Error class

- **Response format validation**
  - Reviewed actual cart ID format (`cart_${sessionId}`) against spec examples
  - Verified it aligns with spec description: "Cart identifier (typically matches session)"
  - Kept implementation as-is since it fulfills the contract
  ---

### Follow-Up 1: Add Return Statements to Responses
 Response calls in cart-routes.ts didn't use `return` statement, which is Express best practice.
 
 **Prompt:**
 `"In cart-routes.ts, add `return` before all `res.status()` calls to make control flow explicit and prevent accidental code execution after response. This follows Express best practices."`
 
 **Result:** All responses now use `return res.status()...` pattern.


### Follow-Up 2: Add API Usage Examples
 To help reviewers and future developers test the API easily.
 
**Prompt:**
`"Create a bash script (example-usage.sh) that demonstrates the API by:
Creating a cart
Adding multiple items (5G plan, iPhone, phone cases)  
Updating item quantities
Showing final cart state
Use curl for HTTP requests and format JSON output nicely."`

**Result:** Created executable script with real-world telecom examples.


### Follow-Up 3: Create Architecture Documentation 
The context recovery mechanism is the core value of this implementation. Visual documentation would help explain it clearly.
**Prompt:** 
`"Create ARCHITECTURE_FLOW.md with ASCII diagrams showing: 1. System architecture with 3 layers 2. Normal operation flow 3. Detailed context recovery flow (what happens when context expires) 4. Timeline showing context expiry over 30+ minutes 5. Data flow between sessions (persistent) and contexts (ephemeral) 6. Error handling for different scenarios Make the recovery mechanism crystal clear."`

**Result:** Comprehensive documentation with detailed diagrams explaining the system architecture and recovery process. 
