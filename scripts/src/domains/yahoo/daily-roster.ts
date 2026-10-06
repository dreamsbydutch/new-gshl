import { load } from "cheerio";
import { extractYahooLineupSlotFromCell } from "./matchup-utils";

export type YahooRosterPlayer = {
  yahooId: string;
  playerName: string;
  dailyPos: string;
  nhlPos: string[];
};

/** Only roster metadata is read; Yahoo's displayed statistics are ignored. */
export function parseDailyYahooRoster(
  html: string,
  expected?: { leagueId: string; teamId: string; date: string },
): YahooRosterPlayer[] {
  const $ = load(html);
  if (expected) {
    const canonical = $("link[rel=canonical]").attr("href");
    const selectedDate = $('select[name="date"] option[selected]').attr(
      "value",
    );
    const path = `/hockey/${expected.leagueId}/${expected.teamId}`;
    const matches = (value: string | undefined) => {
      if (!value) return false;
      try {
        const url = new URL(value, "https://hockey.fantasysports.yahoo.com");
        return (
          url.hostname === "hockey.fantasysports.yahoo.com" &&
          (url.pathname === path || url.pathname === `${path}/team`) &&
          url.searchParams.get("date") === expected.date
        );
      } catch {
        return false;
      }
    };
    if (!matches(canonical) || !matches(selectedDate)) {
      throw new Error(
        "Yahoo page does not confirm the requested league, team, and date.",
      );
    }
  }
  const tables = $("#statTable0, #statTable1");
  if (tables.length !== 2) {
    throw new Error(
      "Yahoo did not return both skater and goalie roster tables.",
    );
  }
  const players: YahooRosterPlayer[] = [];
  tables.find("tbody tr").each((_, element) => {
    const row = $(element);
    const anchor = row
      .find('a[data-ys-playerid], a[href*="/players/"]')
      .first();
    if (!anchor.length) {
      const name = row.find(".ysf-player-name").text().trim();
      // Yahoo also wraps vacant slots in its player-name element.
      if (name && name !== "(Empty)") {
        throw new Error("A Yahoo roster player is missing a stable player ID.");
      }
      return; // Empty roster slot or table summary.
    }
    const yahooId =
      anchor.attr("data-ys-playerid") ??
      /\/players\/(\d+)/.exec(anchor.attr("href") ?? "")?.[1] ??
      "";
    const playerName = anchor.text().trim();
    const dailyPos = extractYahooLineupSlotFromCell(
      row.children("td").first().html() ?? "",
    );
    const details = anchor
      .closest("td")
      .find("span")
      .map((_, span) => $(span).text())
      .get();
    const positions = details
      .map(
        (text) =>
          /\b[A-Za-z]{2,4}\s*[-–]\s*((?:LW|RW|C|D|G)(?:\s*[,/]\s*(?:LW|RW|C|D|G))*)\b/.exec(
            text,
          )?.[1],
      )
      .find(Boolean);
    const nhlPos = [
      ...new Set((positions ?? "").split(/\s*[,/]\s*/).filter(Boolean)),
    ].sort();
    if (!/^\d+$/.test(yahooId) || !playerName || !dailyPos || !nhlPos.length) {
      throw new Error(
        "A Yahoo roster row is missing identity, eligibility, or daily position.",
      );
    }
    if (players.some((player) => player.yahooId === yahooId)) {
      throw new Error(`Duplicate Yahoo player ${yahooId} on a roster page.`);
    }
    players.push({ yahooId, playerName, dailyPos, nhlPos });
  });
  if (!players.length)
    throw new Error(
      "Yahoo returned an empty roster; refusing to infer removals.",
    );
  return players;
}

export type RosterIdentity = {
  id: string;
  yahooId?: string | null;
  fullName?: string | null;
};
export type RosterDay = {
  id: string;
  playerId: string;
  seasonId: string;
  weekId: string;
  date: string;
  gshlTeamId: string;
  dailyPos?: string | null;
  nhlPos?: string[] | null;
  posGroup?: string | null;
};
export type RosterMetadata = Omit<RosterDay, "id"> & {
  dailyPos: string;
  nhlPos: string[];
  posGroup: string;
};

export function planDailyYahooRosters(input: {
  seasonId: string;
  weekId: string;
  date: string;
  rosters: { teamId: string; players: YahooRosterPlayer[] }[];
  players: RosterIdentity[];
  existing: RosterDay[];
  removeMissing?: boolean;
}) {
  const rosterDays: RosterMetadata[] = [];
  const conflicts: string[] = [];
  const creates: RosterMetadata[] = [];
  const updates: { id: string; data: RosterMetadata }[] = [];
  const identityUpdates: { id: string; yahooId: string; fullName: string }[] =
    [];
  const normalizeName = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const seen = new Set<string>();
  let unchanged = 0;
  for (const roster of input.rosters) {
    for (const source of roster.players) {
      let matches = input.players.filter(
        (player) => String(player.yahooId ?? "") === source.yahooId,
      );
      if (!matches.length) {
        const nameMatches = input.players.filter(
          (player) =>
            !!player.fullName &&
            normalizeName(player.fullName) === normalizeName(source.playerName),
        );
        if (nameMatches.length === 1 && !nameMatches[0]!.yahooId) {
          matches = nameMatches;
        }
      }
      if (matches.length !== 1) {
        conflicts.push(
          `Yahoo player ${source.yahooId}: ${matches.length} matching GSHL players.`,
        );
        continue;
      }
      const player = matches[0]!;
      if (seen.has(player.id)) {
        conflicts.push(
          `Player ${player.id} appears on multiple Yahoo rosters.`,
        );
        continue;
      }
      seen.add(player.id);
      if (!player.yahooId)
        identityUpdates.push({
          id: player.id,
          yahooId: source.yahooId,
          fullName: source.playerName,
        });
      const existing = input.existing.filter(
        (row) => row.playerId === player.id,
      );
      if (existing.length > 1) {
        conflicts.push(`Player ${player.id} has duplicate day rows.`);
        continue;
      }
      const data: RosterMetadata = {
        seasonId: input.seasonId,
        weekId: input.weekId,
        date: input.date,
        playerId: player.id,
        gshlTeamId: roster.teamId,
        dailyPos: source.dailyPos,
        nhlPos: [...source.nhlPos].sort(),
        posGroup: source.nhlPos.includes("G")
          ? "G"
          : source.nhlPos.includes("D")
            ? "D"
            : "F",
      };
      rosterDays.push(data);
      const previous = existing[0];
      if (!previous) creates.push(data);
      else if (
        Object.entries(data).some(([key, value]) => {
          const before = previous[key as keyof RosterDay];
          return (
            JSON.stringify(
              Array.isArray(before) ? [...before].sort() : before,
            ) !== JSON.stringify(value)
          );
        })
      )
        updates.push({ id: previous.id, data });
      else unchanged++;
    }
  }
  // Missing rows require explicit backed-up removal mode; identity conflicts still block.
  const missing = input.existing.filter((row) => !seen.has(row.playerId));
  for (const row of input.removeMissing ? [] : missing)
    conflicts.push(
      `Existing day ${row.id} is absent from Yahoo; review its removal.`,
    );
  return {
    removals: input.removeMissing ? missing : [],
    creates,
    updates,
    identityUpdates,
    unchanged,
    conflicts,
    rosterDays,
  };
}
