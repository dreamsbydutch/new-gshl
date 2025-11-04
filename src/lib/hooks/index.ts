/**
 * GSHL React Hooks Barrel Exports
 *
 * This module provides a centralized export point for all custom React hooks
 * used throughout the GSHL fantasy hockey league application.
 *
 * Architecture Philosophy:
 * -----------------------
 * - Hooks orchestrate connections between multiple data sources and utilities
 * - Heavy data manipulation and calculations live in lib/utils
 * - Hooks focus on: fetching data, combining sources, applying utils, managing state
 *
 * Folder Organization:
 * -------------------
 * - main: Core TRPC data fetching hooks that query the backend
 * - features: Orchestration hooks that compose data + utils for UI features
 */

// Core data fetching hooks
export * from "./main";

// Feature orchestration hooks
export * from "./features";
