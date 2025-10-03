import { z } from "zod";

// Common validation schemas
export const idSchema = z.object({
  id: z.string(),
});

export const paginationSchema = z.object({
  take: z.number().int().positive().max(100).optional(),
  skip: z.number().int().nonnegative().optional(),
});

export const orderBySchema = z.record(z.enum(["asc", "desc"]));

// Base query options schema
export const baseQuerySchema = z.object({
  take: z.number().int().positive().max(100).optional(),
  skip: z.number().int().nonnegative().optional(),
  orderBy: z.record(z.enum(["asc", "desc"])).optional(),
});

// Common date schemas
export const dateSchema = z.date().or(z.string().datetime());

// Common response schemas
export const countResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

// Generic batch operation schemas
export const batchDeleteSchema = z.object({
  ids: z.array(z.string()),
});

// Success response
export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
