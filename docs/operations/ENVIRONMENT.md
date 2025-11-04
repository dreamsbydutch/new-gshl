# Environment Variables

Complete reference for all environment variables required by the GSHL application.

---

## Table of Contents

- [Overview](#overview)
- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Google Sheets Configuration](#google-sheets-configuration)
- [Yahoo Scraper Configuration](#yahoo-scraper-configuration)
- [NextAuth Configuration](#nextauth-configuration)
- [UploadThing Configuration](#uploadthing-configuration)
- [Validation](#validation)
- [Security Best Practices](#security-best-practices)

---

## Overview

GSHL uses environment variables for configuration and secrets. Variables are:

- Defined in `.env.local` (gitignored)
- Validated at build time via `src/env.js`
- Type-safe via T3 Env pattern
- Never exposed to client (server-only)

---

## Required Variables

### Minimal Configuration

```bash
# .env.local

# Google Sheets (Required)
USE_GOOGLE_SHEETS=true
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID_MAIN=1abc...xyz
SPREADSHEET_ID_PLAYERDAY_1_5=1def...xyz
SPREADSHEET_ID_PLAYERDAY_6_10=1ghi...xyz
SPREADSHEET_ID_PLAYERDAY_11_PLUS=1jkl...xyz

# NextAuth (Required for production)
NEXTAUTH_SECRET=your-random-secret-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000
```

---

## Optional Variables

### Yahoo Scraper

```bash
# Only needed if syncing data from Yahoo Fantasy
YAHOO_LOGIN_EMAIL=your-yahoo-email@example.com
YAHOO_LOGIN_PASSWORD=your-yahoo-password
```

### UploadThing

```bash
# Only needed if using file uploads
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=app_id_...
```

---

## Google Sheets Configuration

### USE_GOOGLE_SHEETS

**Type**: Boolean string  
**Required**: Yes  
**Default**: N/A  
**Example**: `true`

**Purpose**: Enable Google Sheets as database backend.

**Values**:

- `true` - Use Google Sheets (production)
- `false` - Use mock data (development/testing)

---

### GOOGLE_CLIENT_EMAIL

**Type**: String (email address)  
**Required**: Yes (if `USE_GOOGLE_SHEETS=true`)  
**Example**: `gshl-sheets@myproject.iam.gserviceaccount.com`

**Purpose**: Service account email for Google Sheets API authentication.

**How to Get**:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create service account
3. Copy client_email from JSON key

---

### GOOGLE_PRIVATE_KEY

**Type**: String (PEM format)  
**Required**: Yes (if `USE_GOOGLE_SHEETS=true`)  
**Example**:

```
"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**Purpose**: Private key for service account authentication.

**Important**:

- Must include `\n` newline characters
- Must be wrapped in double quotes
- Keep the BEGIN/END markers

**How to Get**:

1. Generate JSON key for service account
2. Copy `private_key` field value (entire string including `\n`)
3. Paste into `.env.local` wrapped in quotes

---

### SPREADSHEET_ID_MAIN

**Type**: String (Google Sheets ID)  
**Required**: Yes  
**Example**: `1Abc2Def3Ghi4Jkl5Mno6Pqr7Stu8Vwx9Yz0`

**Purpose**: Main workbook containing Teams, Contracts, DraftPicks, etc.

**How to Get**:

1. Open Google Sheet in browser
2. Copy ID from URL: `https://docs.google.com/spreadsheets/d/{ID}/edit`
3. Grant service account "Editor" access to sheet

---

### SPREADSHEET_ID_PLAYERDAY_1_5

**Type**: String (Google Sheets ID)  
**Required**: Yes  
**Example**: `1Bcd2Efg3Hij4Klm5Nop6Qrs7Tuv8Wxy9Z01`

**Purpose**: PlayerDay workbook for seasons 1-5.

**Sheet Name**: Must contain sheet named `PlayerDayStatLine`

---

### SPREADSHEET_ID_PLAYERDAY_6_10

**Type**: String (Google Sheets ID)  
**Required**: Yes  
**Example**: `1Cde2Fgh3Ijk4Lmn5Opq6Rst7Uvw8Xyz9012`

**Purpose**: PlayerDay workbook for seasons 6-10.

---

### SPREADSHEET_ID_PLAYERDAY_11_PLUS

**Type**: String (Google Sheets ID)  
**Required**: Yes  
**Example**: `1Def2Ghi3Jkl4Mno5Pqr6Stu7Vwx8Yz09123`

**Purpose**: PlayerDay workbook for seasons 11+.

---

## Yahoo Scraper Configuration

### YAHOO_LOGIN_EMAIL

**Type**: String (email address)  
**Required**: No (only for Yahoo scraping)  
**Example**: `myemail@yahoo.com`

**Purpose**: Yahoo account login for scraping stats.

**Security**: Stored in `.env.local`, never exposed to client.

---

### YAHOO_LOGIN_PASSWORD

**Type**: String  
**Required**: No (only for Yahoo scraping)  
**Example**: `my-secure-password`

**Purpose**: Yahoo account password.

**Security**:

- Use application-specific password if 2FA enabled
- Never commit to git
- Rotate periodically

---

## NextAuth Configuration

### NEXTAUTH_SECRET

**Type**: String (random secret)  
**Required**: Yes (production)  
**Minimum Length**: 32 characters  
**Example**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`

**Purpose**: Signs and encrypts JWT tokens.

**How to Generate**:

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Online generator
https://generate-secret.vercel.app/32
```

**Important**: Use different secrets for dev/staging/production.

---

### NEXTAUTH_URL

**Type**: String (URL)  
**Required**: Yes  
**Example**:

- Development: `http://localhost:3000`
- Production: `https://gshl.yourdomain.com`

**Purpose**: Base URL for NextAuth callbacks.

**Important**: Must match deployment URL in production.

---

## UploadThing Configuration

### UPLOADTHING_SECRET

**Type**: String  
**Required**: No (only for file uploads)  
**Example**: `sk_live_abc123def456ghi789`

**Purpose**: UploadThing API secret key.

**How to Get**:

1. Sign up at [uploadthing.com](https://uploadthing.com)
2. Create app
3. Copy secret key from dashboard

---

### UPLOADTHING_APP_ID

**Type**: String  
**Required**: No (only for file uploads)  
**Example**: `app_id_xyz789`

**Purpose**: UploadThing application identifier.

---

## Validation

### T3 Env Pattern

Environment variables are validated at build time via `src/env.js`:

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Google Sheets
    USE_GOOGLE_SHEETS: z.string().transform((val) => val === "true"),
    GOOGLE_CLIENT_EMAIL: z.string().email(),
    GOOGLE_PRIVATE_KEY: z.string().min(1),
    SPREADSHEET_ID_MAIN: z.string().min(1),
    SPREADSHEET_ID_PLAYERDAY_1_5: z.string().min(1),
    SPREADSHEET_ID_PLAYERDAY_6_10: z.string().min(1),
    SPREADSHEET_ID_PLAYERDAY_11_PLUS: z.string().min(1),

    // Yahoo (optional)
    YAHOO_LOGIN_EMAIL: z.string().email().optional(),
    YAHOO_LOGIN_PASSWORD: z.string().optional(),

    // NextAuth
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url(),

    // UploadThing (optional)
    UPLOADTHING_SECRET: z.string().optional(),
    UPLOADTHING_APP_ID: z.string().optional(),
  },

  runtimeEnv: {
    USE_GOOGLE_SHEETS: process.env.USE_GOOGLE_SHEETS,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    // ... all other vars
  },
});
```

**Benefits**:

- Type-safe access: `env.GOOGLE_CLIENT_EMAIL` (typed as string)
- Automatic validation on build
- Clear error messages for missing vars
- Prevents runtime errors

---

## Security Best Practices

### 1. Never Commit Secrets

`.env.local` is in `.gitignore`. Never commit it.

```gitignore
# .gitignore
.env.local
.env*.local
```

### 2. Use Different Secrets Per Environment

```bash
# .env.local (development)
NEXTAUTH_SECRET=dev-secret-only-for-local

# .env.production (production - in Vercel dashboard)
NEXTAUTH_SECRET=prod-secret-different-from-dev
```

### 3. Rotate Secrets Periodically

- Change `NEXTAUTH_SECRET` every 90 days
- Rotate service account keys yearly
- Update Yahoo password if compromised

### 4. Limit Service Account Permissions

Grant Google Service Account only "Editor" access to specific sheets, not entire Google Drive.

### 5. Use Environment-Specific URLs

```bash
# Development
NEXTAUTH_URL=http://localhost:3000

# Staging
NEXTAUTH_URL=https://staging.gshl.yourdomain.com

# Production
NEXTAUTH_URL=https://gshl.yourdomain.com
```

---

## Deployment Configuration

### Vercel

Add environment variables in Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add each variable
3. Set environment (Production / Preview / Development)
4. Save and redeploy

**Important**: NEVER paste secrets in build logs or public repos.

---

## Troubleshooting

### Error: "GOOGLE_PRIVATE_KEY is required"

**Cause**: Variable missing or invalid

**Solution**:

1. Check `.env.local` exists
2. Verify variable name spelling
3. Ensure value includes `\n` characters
4. Restart dev server

---

### Error: "Invalid credentials"

**Cause**: Service account doesn't have sheet access

**Solution**:

1. Open Google Sheet
2. Click "Share"
3. Add `GOOGLE_CLIENT_EMAIL` with "Editor" role

---

### Error: "NEXTAUTH_SECRET must be at least 32 characters"

**Cause**: Secret too short

**Solution**: Generate new secret with minimum 32 characters

```bash
openssl rand -base64 32
```

---

### Error: "Failed to parse GOOGLE_PRIVATE_KEY"

**Cause**: Newlines not properly escaped

**Solution**: Ensure `\n` characters are present:

```bash
# ❌ WRONG
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIE..."

# ✅ CORRECT
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE..."
```

---

## Next Steps

To dive deeper:

- **[Quick Start](./QUICK_START.md)** - Initial setup
- **[Development Setup](./DEVELOPMENT.md)** - Local configuration
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment

---

_For environment validation code, see `src/env.js`_
