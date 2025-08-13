// Application constants

export const APP_CONFIG = {
  NAME: "GSHL",
  FULL_NAME: "Google Sheets Hockey League",
  VERSION: "1.0.0",
  DESCRIPTION: "Fantasy Hockey League Management System",
} as const;

export const API_CONFIG = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  DEFAULT_TIMEOUT: 10000,
} as const;

export const VALIDATION_RULES = {
  MIN_TEAM_NAME_LENGTH: 1,
  MAX_TEAM_NAME_LENGTH: 50,
  MIN_PLAYER_NAME_LENGTH: 1,
  MAX_PLAYER_NAME_LENGTH: 100,
  MIN_PASSWORD_LENGTH: 8,
  MAX_CONTRACT_YEARS: 8,
} as const;

export const UI_CONFIG = {
  TOAST_DURATION: 3000,
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 200,
} as const;

export const DATE_FORMATS = {
  DISPLAY: "MMM dd, yyyy",
  INPUT: "yyyy-MM-dd",
  API: "yyyy-MM-dd",
  TIMESTAMP: "yyyy-MM-dd HH:mm:ss",
} as const;

export const FANTASY_SCORING = {
  GOALS: 3,
  ASSISTS: 2,
  SHOTS: 0.1,
  HITS: 0.1,
  BLOCKS: 0.2,
  WINS: 3,
  SAVES: 0.1,
  SHUTOUTS: 2,
} as const;
