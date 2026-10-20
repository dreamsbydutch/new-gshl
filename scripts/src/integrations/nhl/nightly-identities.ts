import { createHash } from "node:crypto";
import type { NativeNhlPlayer } from "../../domains/nhl/nightly-season-stats";

const nameKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Two official sources agree on ID, name and role before a debutant is provisioned. */
export async function prepareNightlyIdentities(
  existing: readonly { nhlApiId?: string | null }[],
  source: readonly NativeNhlPlayer[],
  readJson: (url: string) => Promise<unknown> = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error("Official NHL identity source unavailable");
    return response.json();
  },
) {
  const known = new Set(existing.map((p) => Number(p.nhlApiId)));
  const identities = [];
  for (const player of source) {
    if (known.has(player.nhlPlayerId)) continue;
    const sourceUrl = `https://api-web.nhle.com/v1/player/${player.nhlPlayerId}/landing`;
    const body = (await readJson(sourceUrl)) as {
      playerId?: number;
      firstName?: { default?: string };
      lastName?: { default?: string };
      birthDate?: string;
      position?: string;
    };
    const firstName = body.firstName?.default?.trim();
    const lastName = body.lastName?.default?.trim();
    const role =
      body.position === "G" ? "G" : body.position === "D" ? "D" : "F";
    if (
      body.playerId !== player.nhlPlayerId ||
      !firstName ||
      !lastName ||
      firstName.length > 100 ||
      lastName.length > 100 ||
      nameKey(`${firstName} ${lastName}`) !== nameKey(player.name) ||
      !["C", "L", "R", "LW", "RW", "D", "G"].includes(body.position ?? "") ||
      role !== player.fields.posGroup ||
      typeof body.birthDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate) ||
      !Number.isFinite(Date.parse(body.birthDate)) ||
      new Date(body.birthDate).toISOString().slice(0, 10) !== body.birthDate
    )
      throw Error("Official NHL debutant identity sources disagree");
    identities.push({
      official: {
        nhlPlayerId: player.nhlPlayerId,
        firstName,
        lastName,
        birthDate: body.birthDate,
        position: body.position!,
        sourceUrl,
        sourceFetchedAt: Date.now(),
        sourceSha256: createHash("sha256")
          .update(JSON.stringify(body))
          .digest("hex"),
      },
      source: body,
    });
    known.add(player.nhlPlayerId);
  }
  return identities;
}
