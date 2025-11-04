/**
 * Configuration and Metadata
 * ---------------------------
 * Google Sheets configuration, workbook mappings, and model metadata.
 */

export {
  WORKBOOKS,
  MODEL_TO_WORKBOOK,
  SHEETS_CONFIG,
  type DatabaseRecord,
  convertModelToRow,
  convertRowToModel,
} from "./config";

export {
  type ModelDataCategory,
  getModelDataCategory,
  getModelCacheTTL,
  getCacheMetadataSnapshot,
} from "./model-metadata";
