/**
 * GSHL Apps Script - Core Utilities
 * Essential utility functions for Google Sheets operations
 */

// =============================================================================
// TYPE CONVERSION UTILITIES
// =============================================================================

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

function toString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "true" || lower === "yes" || lower === "1";
  }
  return Boolean(value);
}

// =============================================================================
// GOOGLE SHEETS UTILITIES
// =============================================================================

function openWorkbook(idOrFriendlyName) {
  try {
    // Check if it's a direct ID (long string)
    if (typeof idOrFriendlyName === "string" && idOrFriendlyName.length > 20) {
      return SpreadsheetApp.openById(idOrFriendlyName);
    }

    // Use config mapping for friendly names
    return getWorkbook(idOrFriendlyName);
  } catch (error) {
    console.error(
      `Failed to open workbook: ${idOrFriendlyName}`,
      error.message,
    );
    throw error;
  }
}

function openLargeWorkbook(friendlyName) {
  console.log(
    `⏳ Opening large workbook: ${friendlyName} (this may take a moment)...`,
  );
  const startTime = new Date().getTime();

  try {
    const workbook = getWorkbook(friendlyName);
    const endTime = new Date().getTime();
    console.log(`✅ Large workbook opened in ${(endTime - startTime) / 1000}s`);
    return workbook;
  } catch (error) {
    console.error(
      `❌ Failed to open large workbook: ${friendlyName}`,
      error.message,
    );
    throw error;
  }
}

function openSheet(workbook, sheetName) {
  const sheet = workbook.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' not found in workbook`);
  }
  return sheet;
}

function sheetToObjects(sheet, sheetName = null) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1 || lastColumn === 0) {
    return [];
  }

  // Get headers from first row
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  // Get data from remaining rows
  const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  // Convert to objects
  const objects = data.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  // Apply schema validation and transformation if schema is available
  if (sheetName && SHEET_SCHEMAS[sheetName]) {
    return validateAndTransformData(objects, sheetName);
  }

  return objects;
}

function writeObjects(sheet, objects, options = {}) {
  const {
    startRow = 2,
    chunkSize = 100,
    clearFirst = false,
    sheetName = null,
  } = options;

  try {
    if (!objects || objects.length === 0) {
      return { success: false, error: "No objects to write" };
    }

    // Validate and transform data if schema is available
    let processedObjects = objects;
    if (sheetName && SHEET_SCHEMAS[sheetName]) {
      console.log(`📋 Validating data against ${sheetName} schema...`);
      processedObjects = validateAndTransformData(objects, sheetName);

      // Validate sheet structure
      const structureValidation = validateSheetStructure(sheet, sheetName);
      if (!structureValidation.valid) {
        console.error(
          `Sheet structure validation failed:`,
          structureValidation.errors,
        );
        return {
          success: false,
          error: `Sheet structure mismatch: ${structureValidation.errors.join(", ")}`,
        };
      }

      if (structureValidation.warnings.length > 0) {
        console.warn(`Sheet structure warnings:`, structureValidation.warnings);
      }
    }

    // Clear existing data if requested
    if (clearFirst) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clear();
      }
    }

    // Get headers from first object or schema
    let headers;
    if (sheetName && SHEET_SCHEMAS[sheetName]) {
      headers = SHEET_SCHEMAS[sheetName].columns;
    } else {
      headers = Object.keys(processedObjects[0]);
    }

    // Convert objects to 2D array
    const data = processedObjects.map((obj) =>
      headers.map((header) => (obj[header] !== undefined ? obj[header] : "")),
    );

    // Write in chunks to avoid timeouts
    let totalWritten = 0;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const currentRow = startRow + totalWritten;

      const range = sheet.getRange(currentRow, 1, chunk.length, headers.length);
      range.setValues(chunk);

      totalWritten += chunk.length;
      console.log(
        `📝 Wrote chunk ${Math.floor(i / chunkSize) + 1}: ${chunk.length} rows`,
      );
    }

    return {
      success: true,
      rowsWritten: totalWritten,
      message: `Successfully wrote ${totalWritten} rows`,
    };
  } catch (error) {
    console.error("❌ Write operation failed:", error.message);
    return {
      success: false,
      error: error.message,
      rowsWritten: 0,
    };
  }
}

// =============================================================================
// WORKBOOK CONFIGURATION UTILITIES
// =============================================================================

function getWorkbook(friendlyName) {
  if (!friendlyName) {
    throw new Error("Workbook name is required");
  }

  // Normalize the friendly name
  const normalizedName = friendlyName.toString().toLowerCase().trim();

  // Check aliases first
  const configKey = WORKBOOK_ALIASES[normalizedName];
  if (configKey && CONFIG.WORKBOOKS[configKey]) {
    return SpreadsheetApp.openById(CONFIG.WORKBOOKS[configKey]);
  }

  // Check direct config key
  if (CONFIG.WORKBOOKS[friendlyName]) {
    return SpreadsheetApp.openById(CONFIG.WORKBOOKS[friendlyName]);
  }

  throw new Error(
    `Workbook not found: ${friendlyName}. Available: ${Object.keys(WORKBOOK_ALIASES).join(", ")}`,
  );
}

// =============================================================================
// LOGGING UTILITIES
// =============================================================================

function createLogger(name) {
  return {
    info: (message) => console.log(`[${name}] ${message}`),
    warn: (message) => console.log(`[${name}] ⚠️ ${message}`),
    error: (message) => console.error(`[${name}] ❌ ${message}`),
  };
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && Object.keys(value).length === 0)
  );
}

/**
 * Validate and transform data according to sheet schema
 */
function validateAndTransformData(data, sheetName) {
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    console.warn(`No schema found for sheet: ${sheetName}`);
    return data;
  }

  return data.map((row, index) => {
    const transformedRow = {};
    const errors = [];

    // Check required fields
    for (const requiredField of schema.required || []) {
      if (isEmpty(row[requiredField])) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }

    // Transform and validate each column
    for (const [column, value] of Object.entries(row)) {
      const expectedType = schema.types[column];
      if (!expectedType) {
        // Column not in schema, keep as-is but warn
        console.warn(`Unknown column '${column}' in ${sheetName}`);
        transformedRow[column] = value;
        continue;
      }

      try {
        transformedRow[column] = convertValueByType(value, expectedType);
      } catch (error) {
        errors.push(`Invalid ${expectedType} for ${column}: ${value}`);
        transformedRow[column] = getDefaultValueForType(expectedType);
      }
    }

    // Add missing columns with defaults
    for (const column of schema.columns) {
      if (!(column in transformedRow)) {
        const type = schema.types[column];
        transformedRow[column] = getDefaultValueForType(type);
      }
    }

    if (errors.length > 0) {
      console.error(`Row ${index + 1} validation errors:`, errors);
    }

    return transformedRow;
  });
}

/**
 * Convert value to specified type with validation
 */
function convertValueByType(value, type) {
  switch (type) {
    case "number":
      return toNumber(value);
    case "string":
      return toString(value);
    case "boolean":
      return toBoolean(value);
    case "date":
      return toDate(value);
    default:
      return value;
  }
}

/**
 * Get default value for a given type
 */
function getDefaultValueForType(type) {
  switch (type) {
    case "number":
      return 0;
    case "string":
      return "";
    case "boolean":
      return false;
    case "date":
      return new Date();
    default:
      return null;
  }
}

/**
 * Create typed object factory for a specific sheet
 */
function createTypedObjectFactory(sheetName) {
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    throw new Error(`No schema found for sheet: ${sheetName}`);
  }

  return function createTypedObject(data = {}) {
    const typedObject = {};

    for (const column of schema.columns) {
      const type = schema.types[column];
      const value = data[column];

      if (value !== undefined) {
        typedObject[column] = convertValueByType(value, type);
      } else {
        typedObject[column] = getDefaultValueForType(type);
      }
    }

    return typedObject;
  };
}

/**
 * Validate sheet structure matches schema
 */
function validateSheetStructure(sheet, sheetName) {
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    console.warn(`No schema to validate against for sheet: ${sheetName}`);
    return { valid: true, warnings: [`No schema defined for ${sheetName}`] };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const errors = [];
  const warnings = [];

  // Check for missing required columns
  for (const requiredColumn of schema.columns) {
    if (!headers.includes(requiredColumn)) {
      errors.push(`Missing required column: ${requiredColumn}`);
    }
  }

  // Check for extra columns not in schema
  for (const header of headers) {
    if (!schema.columns.includes(header)) {
      warnings.push(`Extra column not in schema: ${header}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema: schema.columns,
    actual: headers,
  };
}

// =============================================================================
// AGGREGATION UTILITIES
// =============================================================================

/**
 * Safely sum numeric values from an array of objects
 */
function safeSum(objects, field) {
  return objects.reduce((sum, obj) => sum + toNumber(obj[field]), 0);
}

/**
 * Safely calculate average from an array of objects
 */
function safeAverage(objects, field) {
  if (!objects || objects.length === 0) return 0;
  const total = safeSum(objects, field);
  return total / objects.length;
}

/**
 * Create aggregation helper for specific schema type
 */
function createAggregator(sheetName) {
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    throw new Error(`No schema found for aggregation: ${sheetName}`);
  }

  return {
    /**
     * Sum numeric fields across multiple records
     */
    sum: (records, fields) => {
      const result = {};
      const fieldsToSum =
        fields ||
        schema.columns.filter((col) => schema.types[col] === "number");

      for (const field of fieldsToSum) {
        if (schema.types[field] === "number") {
          result[field] = safeSum(records, field);
        }
      }
      return result;
    },

    /**
     * Average numeric fields across multiple records
     */
    average: (records, fields) => {
      const result = {};
      const fieldsToAverage =
        fields ||
        schema.columns.filter((col) => schema.types[col] === "number");

      for (const field of fieldsToAverage) {
        if (schema.types[field] === "number") {
          result[field] = safeAverage(records, field);
        }
      }
      return result;
    },

    /**
     * Get first non-null value for each field
     */
    first: (records, fields) => {
      const result = {};
      const fieldsToGet = fields || schema.columns;

      for (const field of fieldsToGet) {
        const firstRecord = records.find(
          (record) => record[field] !== null && record[field] !== undefined,
        );
        result[field] = firstRecord
          ? firstRecord[field]
          : getDefaultValueForType(schema.types[field]);
      }
      return result;
    },
  };
}

/**
 * Type-safe object creation with validation
 */
function createTypedRecord(sheetName, data = {}) {
  const factory = createTypedObjectFactory(sheetName);
  const record = factory(data);

  // Validate the created record
  const validationResult = validateRecord(record, sheetName);
  if (!validationResult.valid) {
    console.warn(
      `Created record has validation issues:`,
      validationResult.errors,
    );
  }

  return record;
}

/**
 * Validate a single record against schema
 */
function validateRecord(record, sheetName) {
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    return { valid: false, errors: [`No schema found for ${sheetName}`] };
  }

  const errors = [];

  // Check required fields
  for (const requiredField of schema.required || []) {
    if (isEmpty(record[requiredField])) {
      errors.push(`Missing required field: ${requiredField}`);
    }
  }

  // Check field types
  for (const [field, value] of Object.entries(record)) {
    const expectedType = schema.types[field];
    if (expectedType && !isValidType(value, expectedType)) {
      errors.push(
        `Invalid type for ${field}: expected ${expectedType}, got ${typeof value}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if value matches expected type
 */
function isValidType(value, expectedType) {
  switch (expectedType) {
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return value instanceof Date && !isNaN(value.getTime());
    default:
      return true;
  }
}

// =============================================================================
// BATCH PROCESSING UTILITIES
// =============================================================================

/**
 * Process large datasets in chunks to avoid timeouts
 */
function processInChunks(data, processor, chunkSize = 100) {
  const results = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const chunkResult = processor(chunk, i);
    results.push(chunkResult);

    // Log progress
    console.log(
      `Processed chunk ${Math.floor(i / chunkSize) + 1}: ${chunk.length} items`,
    );
  }

  return results;
}

/**
 * Type-safe sheet reader with error handling
 */
function readTypedSheet(workbook, sheetName) {
  try {
    console.log(`📖 Reading ${sheetName} with type validation...`);

    const sheet = openSheet(workbook, sheetName);
    const data = sheetToObjects(sheet, sheetName);

    console.log(
      `✅ Successfully read ${data.length} records from ${sheetName}`,
    );
    return { success: true, data, count: data.length };
  } catch (error) {
    console.error(`❌ Failed to read ${sheetName}:`, error.message);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Type-safe sheet writer with validation
 */
function writeTypedSheet(workbook, sheetName, data, options = {}) {
  try {
    console.log(
      `📝 Writing ${data.length} records to ${sheetName} with validation...`,
    );

    const sheet = openSheet(workbook, sheetName);
    const result = writeObjects(sheet, data, {
      ...options,
      sheetName,
    });

    if (result.success) {
      console.log(
        `✅ Successfully wrote ${result.rowsWritten} records to ${sheetName}`,
      );
    }

    return result;
  } catch (error) {
    console.error(`❌ Failed to write ${sheetName}:`, error.message);
    return { success: false, error: error.message };
  }
}
