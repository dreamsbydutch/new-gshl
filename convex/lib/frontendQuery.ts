// Compatibility aliases for existing planner callers.
export {
  selectCompatibilityIndexPlan as selectFrontendIndexPlan,
  canTakeRowsBeforeFiltering as canTakeFrontendRowsBeforeFiltering,
  type CompatibilityIndexPlan as FrontendIndexPlan,
} from "./compatibilityRead";
