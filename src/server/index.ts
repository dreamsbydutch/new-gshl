/**
 * Server-side barrel exports
 * ---------------------------
 * Centralized exports for server-only modules including API routers,
 * cron jobs, scrapers, and utility scripts.
 *
 * ⚠️ WARNING: This file should ONLY be imported in server contexts
 * (API routes, server components, server actions).
 * Never import from client components.
 */

// API exports (already has its own barrel)
export * from "./api";
