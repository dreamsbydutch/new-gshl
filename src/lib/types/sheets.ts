// Google Sheets specific types

export interface WorkbookConfig {
  GENERAL: string;
  PLAYERDAYS: string;
  PLAYERSTATS: string;
  TEAMSTATS: string;
}

export type SheetConfig = Record<string, string>;

export type ColumnConfig = Record<string, string[]>;

export interface SheetsConfig {
  WORKBOOKS: WorkbookConfig;
  SHEETS: SheetConfig;
  COLUMNS: ColumnConfig;
}

export interface FieldTransforms {
  dateFields?: string[];
  booleanFields?: string[];
  numberFields?: string[];
  timestampFields?: string[];
  arrayFields?: string[];
}

export type ModelTransforms = Record<string, FieldTransforms>;

// Google Sheets API types
export interface SheetsCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

export type SheetRow = Record<string, string | number | boolean | null>;

export interface SheetQueryOptions<T = unknown> {
  where?: Record<string, T>;
  take?: number;
  skip?: number;
}

export type SheetUpdateData = Record<string, unknown>;

export type SheetCreateResult = Record<string, unknown> & {
  id: string | number;
};

export type SheetUpdateResult = Record<string, unknown> & {
  id: string | number;
};

export interface SheetDeleteResult {
  id: string | number;
}

export interface SheetCountResult {
  count: number;
}

// Adapter types
export interface FindManyOptions<T = unknown> {
  where?: Partial<T>;
  take?: number;
  skip?: number;
  orderBy?: Record<string, "asc" | "desc">;
}

export interface FindUniqueOptions<T = unknown> {
  where: Partial<T>;
}

export interface CreateOptions<T = unknown> {
  data: Omit<T, "id" | "createdAt" | "updatedAt">;
}

export interface CreateManyOptions<T = unknown> {
  data: Array<Omit<T, "id" | "createdAt" | "updatedAt">>;
}

export interface UpdateOptions<T = unknown> {
  where: { id: string | number };
  data: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>;
}

export interface DeleteOptions {
  where: { id: string | number };
}
