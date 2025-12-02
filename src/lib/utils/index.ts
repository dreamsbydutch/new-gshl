/**
 * GSHL Utility Functions Barrel Exports
 *
 * This module provides a centralized export point for all utility functions
 * used throughout the GSHL fantasy hockey league application.
 *
 * Utilities are now organized into logical subdirectories:
 * - core: Generic, reusable utilities (date, format, validation, etc.)
 * - domain: Business domain utilities (season, team, lineup)
 * - features: Component-specific utilities for UI features
 * - stats: Statistics aggregation system
 * - shared: Shared constants and configurations
 * - integrations: External service integrations
 */

// Core utilities - Generic helpers used everywhere
export * from "./core";

// Domain utilities - GSHL business logic
export * from "./domain";

// Shared utilities and constants (exported before features to establish source of truth)
export * from "./shared";

// Feature utilities - Component-specific helpers
export * from "./features";

// External integrations
export * from "./integrations";
