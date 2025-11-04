"use client";

/**
 * ServiceAccountInfo Component
 *
 * Displays Google service account email and provides quick access to share
 * PlayerDay workbooks. Shows sharing instructions and workbook links for
 * different season ranges.
 *
 * Features:
 * - Fetches and displays service account email
 * - One-click copy to clipboard
 * - Direct links to PlayerDay workbooks
 * - Sharing instructions for Google Sheets access
 */

import { useState } from "react";
import { Button } from "@gshl-ui";

// ============================================================================
// CONSTANTS
// ============================================================================

const PLAYER_DAY_WORKBOOKS = [
  {
    name: "PlayerDays 1-5 (Seasons 1-5)",
    id: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
    url: "https://docs.google.com/spreadsheets/d/1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g/edit",
  },
  {
    name: "PlayerDays 6-10 (Seasons 6-10)",
    id: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
    url: "https://docs.google.com/spreadsheets/d/14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0/edit",
    highlight: true,
  },
  {
    name: "PlayerDays 11-15 (Seasons 11-15)",
    id: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
    url: "https://docs.google.com/spreadsheets/d/18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag/edit",
  },
];

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const ServiceEmailDisplay = ({
  email,
  onCopy,
}: {
  email: string;
  onCopy: () => void;
}) => (
  <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          Service Account Email:
        </p>
        <code className="mt-1 block break-all text-sm text-blue-900 dark:text-blue-100">
          {email}
        </code>
      </div>
      <Button onClick={onCopy} variant="outline" size="sm" className="ml-2">
        Copy
      </Button>
    </div>
  </div>
);

const SharingInstructions = () => (
  <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/20">
    <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
      📖 How to share workbooks:
    </h3>
    <ol className="ml-4 mt-2 list-decimal space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
      <li>Open the workbook link below</li>
      <li>Click the &quot;Share&quot; button in the top-right</li>
      <li>Paste the service account email</li>
      <li>Give &quot;Viewer&quot; permissions</li>
      <li>Click &quot;Done&quot;</li>
    </ol>
  </div>
);

const WorkbookLink = ({
  name,
  url,
  highlight,
}: {
  name: string;
  url: string;
  highlight?: boolean;
}) => (
  <div
    className={`flex items-center justify-between rounded-md border p-3 ${
      highlight
        ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
        : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
    }`}
  >
    <div className="flex-1">
      <p
        className={`text-sm font-medium ${
          highlight
            ? "text-green-900 dark:text-green-100"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {name}
      </p>
      {highlight && (
        <span className="mt-1 inline-block rounded bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800 dark:text-green-200">
          Current Season
        </span>
      )}
    </div>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-4 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
    >
      Open Workbook →
    </a>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function ServiceAccountInfo() {
  const [serviceEmail, setServiceEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServiceEmail = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/debug/service-account");
      if (!response.ok) {
        throw new Error("Failed to fetch service account info");
      }
      const data = (await response.json()) as { email: string };
      setServiceEmail(data.email);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch service account",
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          🔑 Service Account Setup
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Share PlayerDay workbooks with your service account to enable data
          access
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {!serviceEmail ? (
        <Button onClick={fetchServiceEmail} disabled={loading}>
          {loading ? "Loading..." : "Show Service Account Email"}
        </Button>
      ) : (
        <div className="space-y-4">
          <ServiceEmailDisplay
            email={serviceEmail}
            onCopy={() => copyToClipboard(serviceEmail)}
          />

          <SharingInstructions />

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              📊 PlayerDay Workbooks:
            </h3>
            {PLAYER_DAY_WORKBOOKS.map((workbook) => (
              <WorkbookLink
                key={workbook.id}
                name={workbook.name}
                url={workbook.url}
                highlight={workbook.highlight}
              />
            ))}
          </div>

          <div className="mt-6 rounded-md bg-gray-100 p-4 dark:bg-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              ✅ Next Steps:
            </h4>
            <ul className="ml-4 mt-2 list-disc space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <li>Share all workbooks with the service account</li>
              <li>Use the Yahoo Scraper to collect daily stats</li>
              <li>Run weekly aggregations to calculate matchup scores</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
