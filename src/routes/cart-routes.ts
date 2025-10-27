/**
 * Express routes for Cart API
 * Implements REST endpoints for cart operations
 */

import { Router, Request, Response } from 'express';
import { ICartService } from '../types';
import {
  CartNotFoundError,
  ItemNotFoundError,
  ContextRecoveryFailedError,
} from '../errors';

export function createCartRouter(cartService: ICartService): Router {
  const router = Router();

  /**
   * POST / - Create a new cart session
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const result = await cartService.createCart();
      return res.status(201).json({
        sessionId: result.sessionId,
        cart: result.cart,
      });
    } catch (error) {
      console.error('Error creating cart:', error);
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to create cart',
      });
    }
  });

  /**
   * GET /:sessionId - Get cart by session ID
   */
  router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const cart = await cartService.getCart(sessionId);

      return res.status(200).json({
        sessionId,
        cart,
      });
    } catch (error) {
      if (error instanceof CartNotFoundError) {
        return res.status(404).json({
          error: 'CartNotFound',
          message: error.message,
        });
      } else {
        console.error('Error getting cart:', error);
        return res.status(500).json({
          error: 'InternalServerError',
          message: 'Failed to get cart',
        });
      }
    }
  });

  /**
   * POST /:sessionId/items - Add item to cart
   */
  router.post('/:sessionId/items', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { productId, name, price, quantity } = req.body;

      // Basic validation
      if (!productId || !name || price === undefined || quantity === undefined) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Missing required fields: productId, name, price, quantity',
        });
      }

      if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Price must be a positive number',
        });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Quantity must be a positive integer',
        });
      }

      const cart = await cartService.addItem(sessionId, {
        productId,
        name,
        price,
        quantity,
      });

      return res.status(200).json({
        sessionId,
        cart,
      });
    } catch (error) {
      if (error instanceof CartNotFoundError) {
        return res.status(404).json({
          error: 'CartNotFound',
          message: error.message,
        });
      } else if (error instanceof ContextRecoveryFailedError) {
        return res.status(409).json({
          error: 'ContextRecoveryFailed',
          message: error.message,
          sessionId: req.params.sessionId,
        });
      } else {
        console.error('Error adding item to cart:', error);
        return res.status(500).json({
          error: 'InternalServerError',
          message: 'Failed to add item to cart',
        });
      }
    }
  });

  /**
   * DELETE /:sessionId/items/:itemId - Remove item from cart
   */
  router.delete('/:sessionId/items/:itemId', async (req: Request, res: Response) => {
    try {
      const { sessionId, itemId } = req.params;
      const cart = await cartService.removeItem(sessionId, itemId);

      return res.status(200).json({
        sessionId,
        cart,
      });
    } catch (error) {
      if (error instanceof CartNotFoundError) {
        return res.status(404).json({
          error: 'CartNotFound',
          message: error.message,
        });
      } else if (error instanceof ItemNotFoundError) {
        return res.status(404).json({
          error: 'ItemNotFound',
          message: error.message,
        });
      } else if (error instanceof ContextRecoveryFailedError) {
        return res.status(409).json({
          error: 'ContextRecoveryFailed',
          message: error.message,
          sessionId: req.params.sessionId,
        });
      } else {
        console.error('Error removing item from cart:', error);
        return res.status(500).json({
          error: 'InternalServerError',
          message: 'Failed to remove item from cart',
        });
      }
    }
  });

  /**
   * PUT /:sessionId/items/:itemId - Update item quantity (optional/stretch)
   */
  router.put('/:sessionId/items/:itemId', async (req: Request, res: Response) => {
    try {
      const { sessionId, itemId } = req.params;
      const { quantity } = req.body;

      // Validation
      if (quantity === undefined) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Missing required field: quantity',
        });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Quantity must be a positive integer',
        });
      }

      const cart = await cartService.updateItem(sessionId, itemId, quantity);

      return res.status(200).json({
        sessionId,
        cart,
      });
    } catch (error) {
      if (error instanceof CartNotFoundError) {
        return res.status(404).json({
          error: 'CartNotFound',
          message: error.message,
        });
      } else if (error instanceof ItemNotFoundError) {
        return res.status(404).json({
          error: 'ItemNotFound',
          message: error.message,
        });
      } else if (error instanceof ContextRecoveryFailedError) {
        return res.status(409).json({
          error: 'ContextRecoveryFailed',
          message: error.message,
          sessionId: req.params.sessionId,
        });
      } else {
        console.error('Error updating item in cart:', error);
        return res.status(500).json({
          error: 'InternalServerError',
          message: 'Failed to update item in cart',
        });
      }
    }
  });

  return router;
}
