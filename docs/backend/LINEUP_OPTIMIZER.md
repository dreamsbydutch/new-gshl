# Lineup Optimizer

The lineup optimizer is the decision engine behind `LineupBuilder`.

## What It Does

- chooses a mathematically optimal `bestPos` lineup from eligible players
- preserves a realistic played-player `fullPos` lineup
- computes helper flags used downstream in daily and season aggregations

## Current Scope

This optimizer is only part of the active-season Yahoo ingest flow. It is not
documented or supported as a historical backfill or manual repair tool.
