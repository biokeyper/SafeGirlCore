/**
 * Request Validation Middleware
 * Validates request body, query params, or path params against Zod schemas
 * Returns 400 Bad Request with detailed error messages on validation failure
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import logger from "../utils/logger";

type ValidationSource = "body" | "query" | "params";

/**
 * Create validation middleware for request data
 * @param schema - Zod schema to validate against
 * @param source - Where to validate: body, query, or params
 * @returns Express middleware function
 */
export function validate(
  schema: z.ZodSchema,
  source: ValidationSource = "body"
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const dataToValidate = (() => {
        switch (source) {
          case "query":
            return req.query;
          case "params":
            return req.params;
          case "body":
          default:
            return req.body;
        }
      })();

      const validated = schema.parse(dataToValidate);

      // Replace request data with validated data (sanitized/trimmed)
      switch (source) {
        case "query":
          req.query = validated as any;
          break;
        case "params":
          req.params = validated as any;
          break;
        case "body":
        default:
          req.body = validated;
      }

      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errors = error.issues || [];
        logger.warn("VALIDATION", `${source} validation failed`, {
          path: req.path,
          method: req.method,
          errors: errors.map((e: any) => ({
            path: e.path.join("."),
            message: e.message,
            code: e.code,
          })),
        });

        // Format error message for client
        const messages = errors
          .map((err: any) => {
            const field = err.path.join(".");
            return `${field}: ${err.message}`;
          })
          .join("; ");

        res.status(400).json({
          error: true,
          message: `Invalid ${source}. ${messages}`,
          code: "VALIDATION_ERROR",
          details: errors.map((e: any) => ({
            field: e.path.join("."),
            message: e.message,
            received: e.received,
          })),
        });
        return;
      }

      logger.error("VALIDATION", "Validation middleware error", {
        error: (error as Error).message || String(error),
      });

      res.status(400).json({
        error: true,
        message: "Validation failed",
        code: "VALIDATION_ERROR",
      });
    }
  };
}

/**
 * Validate body + query together
 * Usage: validateBodyAndQuery(bodySchema, querySchema)
 */
export function validateBodyAndQuery(
  bodySchema: z.ZodSchema,
  querySchema: z.ZodSchema
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validatedBody = bodySchema.parse(req.body);
      const validatedQuery = querySchema.parse(req.query);

      req.body = validatedBody;
      req.query = validatedQuery as any;

      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errors = error.issues || [];
        logger.warn("VALIDATION", "Body + Query validation failed", {
          path: req.path,
          method: req.method,
          errors: errors,
        });

        const messages = errors
          .map((err: any) => `${err.path.join(".")}: ${err.message}`)
          .join("; ");

        res.status(400).json({
          error: true,
          message: `Invalid request. ${messages}`,
          code: "VALIDATION_ERROR",
          details: errors.map((e: any) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }

      res.status(400).json({
        error: true,
        message: "Validation failed",
        code: "VALIDATION_ERROR",
      });
    }
  };
}
