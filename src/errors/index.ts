/**
 * Custom error classes for Telecom Cart API
 */

export class ContextExpiredError extends Error {
  constructor(contextId: string) {
    super(`Salesforce context ${contextId} has expired`);
    this.name = 'ContextExpiredError';
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContextExpiredError);
    }
  }
}

export class CartNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Cart session ${sessionId} not found`);
    this.name = 'CartNotFoundError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CartNotFoundError);
    }
  }
}

export class ItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} not found in cart`);
    this.name = 'ItemNotFoundError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ItemNotFoundError);
    }
  }
}

export class ContextRecoveryFailedError extends Error {
  cause?: Error;

  constructor(sessionId: string, cause?: Error) {
    super(`Failed to recover from context expiry for session ${sessionId}`);
    this.name = 'ContextRecoveryFailedError';
    if (cause) {
      this.cause = cause;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContextRecoveryFailedError);
    }
  }
}
