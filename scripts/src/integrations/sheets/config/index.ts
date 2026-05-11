/**
 * Configuration and Metadata
 * ---------------------------
 * Google Sheets configuration, workbook mappings, and model metadata.
 */

export {
  WORKBOOKS,
  PLAYERDAY_WORKBOOK_KEYS,
  MODEL_TO_WORKBOOK,
  SHEETS_CONFIG,
  getPlayerDayWorkbookKey,
  getPlayerDayWorkbookId,
  getSpreadsheetIdForModel,
  getSpreadsheetIdsForModel,
  type DatabaseRecord,
  type PlayerDayWorkbookKey,
  convertModelToRow,
  convertRowToModel,
} from "./config";

export {
  type ModelDataCategory,
  getModelDataCategory,
  getModelCacheTTL,
  getCacheMetadataSnapshot,
} from "./model-metadata";
