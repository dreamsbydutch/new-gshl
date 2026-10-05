import { notFound } from "next/navigation";
import { PerformanceRecordBadge } from "@gshl-components/matchup/PerformanceRecordBadge";
import type { MatchupRecords } from "@gshl-lib/types/performance-records";

export default function RecordBadgePreview() {
  if (process.env.VERCEL_ENV === "production") notFound();
  const records: MatchupRecords = {
    scope: "Illustrative sample data only. Regular-season, seven-day weeks.",
    badges: [
      {
        entityId: "low",
        stat: "G",
        direction: "low",
        tied: false,
        provisional: false,
        value: 1,
        previous: 2,
        compared: 2100,
        ties: 0,
        examples: [],
      },
      {
        entityId: "tie",
        stat: "G",
        direction: "low",
        tied: true,
        provisional: false,
        value: 1,
        previous: 1,
        compared: 2100,
        ties: 3,
        examples: [],
      },
      {
        entityId: "live",
        stat: "G",
        direction: "low",
        tied: true,
        provisional: true,
        value: 1,
        previous: 1,
        compared: 2100,
        ties: 3,
        examples: [],
      },
      {
        entityId: "player",
        stat: "G",
        direction: "high",
        tied: false,
        provisional: false,
        value: 9,
        previous: 8,
        compared: 40000,
        ties: 0,
        examples: [],
      },
    ],
  };
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <h1 className="text-xl font-semibold">Historical performance badges</h1>
      <p className="text-sm text-slate-600">
        Design preview with sample data. Tap a badge for details. Real badges
        appear on matchup pages only in the final two calendar days or
        afterward.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="p-3 text-left">Example</th>
            <th>Goals</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Monday, no games played", "monday", 0],
            ["Final team low", "low", 1],
            ["Final tied low", "tie", 1],
            ["Saturday, provisional tie", "live", 1],
            ["Final player high", "player", 9],
          ].map(([label, id, value]) => (
            <tr key={id} className="border-t">
              <td className="p-3">{label}</td>
              <td className="text-center tabular-nums">
                {value}
                <PerformanceRecordBadge
                  records={records}
                  entityId={String(id)}
                  stat="G"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">
        ~ means provisional; = means tied. Blank stats and zero games played do
        not receive badges.
      </p>
    </main>
  );
}
