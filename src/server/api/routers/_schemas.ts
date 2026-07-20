import { z } from "zod";
import { TRPCError } from "@trpc/server";

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

/** Prevent accidental full-table reads from high-volume user-facing routes. */
export function requireQueryScope(
  where: Record<string, unknown> | undefined,
  fields: readonly string[],
) {
  const isScoped = fields.some((field) => {
    const value = where?.[field];
    return value !== undefined && value !== null && value !== "";
  });
  if (!isScoped) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This collection requires one of: ${fields.join(", ")}`,
    });
  }
}

// Generic batch operation schemas
export const batchDeleteSchema = z.object({
  ids: z.array(z.string()),
});

// Success response
export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
