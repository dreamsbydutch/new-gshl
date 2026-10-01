import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inflateRawSync, gzipSync, gunzipSync } from "node:zlib";
import { parseOfficialShiftReport } from "../../domains/nhl/official-shift-report";
import type { PenaltyShotHistory } from "../../runtime/nhl-shot-quality";
import {
  parseOfficialPenaltyShots,
  penaltyShotGameMatches,
  type PenaltyShotGameTotal,
} from "../../domains/nhl/official-penalty-shot-report";

export async function fetchPenaltyShotHistory(
  cache: HockeyDataCache,
  season: number,
  gameType: number,
): Promise<PenaltyShotHistory> {
  const fromSeason = Math.max(20052006, season - 5 * 10001);
  const rows = await fetchPenaltyShotRows(
    cache,
    `seasonId>=${fromSeason} and seasonId<${season} and gameTypeId=${gameType}`,
  );
  return { fromSeason, beforeSeason: season, gameType, rows };
}

export async function fetchSeasonPenaltyShots(
  cache: HockeyDataCache,
  season: number,
  gameType: number,
) {
  if (
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000 ||
    ![2, 3].includes(gameType)
  )
    throw new Error("Invalid penalty-shot season scope");
  return fetchPenaltyShotRows(
    cache,
    `seasonId=${season} and gameTypeId=${gameType}`,
  );
}

export async function fetchSeasonPenaltyShotGames(
  cache: HockeyDataCache,
  season: number,
  gameType: number,
) {
  if (
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000 ||
    ![2, 3].includes(gameType)
  )
    throw new Error("Invalid penalty-shot game scope");
  const urls: string[] = [];
  const rows = await fetchPenaltyShotRows<PenaltyShotGameTotal>(
    cache,
    `seasonId=${season} and gameTypeId=${gameType}`,
    true,
    urls,
  );
  if (
    rows.some(
      (p) =>
        Math.floor(p.gameId / 1e6) !== Math.floor(season / 10000) ||
        Math.floor(p.gameId / 10000) % 100 !== gameType ||
        !Number.isInteger(p.playerId) ||
        p.playerId <= 0 ||
        !Number.isInteger(p.penaltyShotAttempts) ||
        p.penaltyShotAttempts < 0 ||
        !Number.isInteger(p.penaltyShotsGoals) ||
        p.penaltyShotsGoals < 0 ||
        p.penaltyShotsGoals > p.penaltyShotAttempts,
    ) ||
    new Set(rows.map((p) => `${p.gameId}:${p.playerId}`)).size !== rows.length
  )
    throw new Error("Invalid official penalty-shot game report");
  return { rows, urls };
}

async function fetchPenaltyShotRows<T = PenaltyShotHistory["rows"][number]>(
  cache: HockeyDataCache,
  expression: string,
  isGame = false,
  urls?: string[],
) {
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: String(isGame),
    start: "0",
    limit: "100",
    sort: JSON.stringify([
      { property: isGame ? "gameId" : "seasonId", direction: "ASC" },
      { property: "playerId", direction: "ASC" },
    ]),
    cayenneExp: expression,
  });
  const rows: T[] = [];
  let expected: number | undefined;
  while (true) {
    params.set("start", String(rows.length));
    const url = `https://api.nhle.com/stats/rest/en/skater/penaltyShots?${params}`;
    urls?.push(url);
    const page = await cache.json<{
      total: number;
      data: T[];
    }>(url);
    if (
      !Array.isArray(page.data) ||
      !Number.isInteger(page.total) ||
      page.total < 0 ||
      page.total >= 10000 ||
      (expected !== undefined && expected !== page.total)
    )
      throw new Error("Invalid penalty-shot history pagination");
    expected = page.total;
    rows.push(...page.data);
    if (rows.length === expected) break;
    if (!page.data.length || rows.length > expected)
      throw new Error("Incomplete penalty-shot history");
  }
  return rows;
}

const digest = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let requestQueue = Promise.resolve();
let nextRequest = 0;
let cooldown = 0;
async function publicFetch(url: string) {
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    let remaining = Math.max(nextRequest, cooldown) - Date.now();
    while (remaining > 0) {
      await delay(remaining);
      remaining = Math.max(nextRequest, cooldown) - Date.now();
    }
    nextRequest = Date.now() + 1200;
  } finally {
    release();
  }
  // Limit request starts, not response latency: one slow response must not stall all workers.
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (response.status === 429) {
    const retryHeader = response.headers.get("retry-after");
    const seconds = Number(retryHeader);
    const retry = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryHeader ?? "") - Date.now();
    cooldown = Math.max(
      cooldown,
      Date.now() + Math.max(60000, Number.isFinite(retry) ? retry : 0),
    );
    console.log(
      "Public hockey source rate limit: honoring a shared cooldown before retrying.",
    );
  }
  return response;
}

/** Immutable, hash-verified public-data cache. No credentials or database access. */
export class HockeyDataCache {
  constructor(
    private directory: string,
    private offline = false,
  ) {}
  async bytes(url: string): Promise<Buffer> {
    if (
      ![
        "api-web.nhle.com",
        "api.nhle.com",
        "www.moneypuck.com",
        "peter-tanner.com",
        "www.nhl.com",
      ].includes(new URL(url).hostname) ||
      new URL(url).protocol !== "https:"
    )
      throw new Error("Unexpected hockey data host");
    await mkdir(this.directory, { recursive: true });
    const path = resolve(this.directory, digest(Buffer.from(url)));
    try {
      const meta = JSON.parse(await readFile(path + ".json", "utf8")) as {
        url: string;
        sha256: string;
        encoding?: "gzip";
      };
      if (meta.encoding !== undefined && meta.encoding !== "gzip")
        throw new Error("Unknown public source cache encoding");
      const stored = await readFile(path + ".bin");
      const body =
        meta.encoding === "gzip"
          ? gunzipSync(stored, { maxOutputLength: 512 * 1024 * 1024 })
          : stored;
      if (meta.url !== url || digest(body) !== meta.sha256)
        throw new Error("Cached public source hash mismatch");
      return body;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (this.offline) throw new Error(`Offline cache missing ${url}`);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await publicFetch(url);
        if (!response.ok)
          throw new Error(
            `Public source HTTP ${response.status} at ${new URL(url).pathname}`,
          );
        const body = Buffer.from(await response.arrayBuffer());
        const encoding = new URL(url).pathname.endsWith(".zip")
          ? undefined
          : "gzip";
        const stored = encoding ? gzipSync(body) : body;
        await writeFile(path + ".tmp", stored);
        await rename(path + ".tmp", path + ".bin");
        await writeFile(
          path + ".json",
          JSON.stringify({
            url,
            fetchedAt: new Date().toISOString(),
            sha256: digest(body),
            bytes: body.length,
            encoding,
            storedBytes: stored.length,
          }) + "\n",
        );
        await delay(150);
        return body;
      } catch (error) {
        if (error instanceof Error && error.message.includes("HTTP 404"))
          throw error;
        if (attempt === 5) throw error;
        await delay(1000 * 2 ** attempt);
      }
    }
    throw new Error("Public source retries exhausted");
  }
  async json<T>(url: string): Promise<T> {
    return JSON.parse((await this.bytes(url)).toString("utf8")) as T;
  }
  async derived<T>(key: string): Promise<T | undefined> {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid derived cache key");
    try {
      let text: string;
      try {
        text = gunzipSync(
          await readFile(resolve(this.directory, `derived-${key}.json.gz`)),
          { maxOutputLength: 512 * 1024 * 1024 },
        ).toString("utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        text = await readFile(
          resolve(this.directory, `derived-${key}.json`),
          "utf8",
        );
      }
      const envelope = JSON.parse(text) as {
        data: T;
        sha256: string;
        sources: Array<{ url: string; sha256: string }>;
      };
      if (
        digest(Buffer.from(JSON.stringify(envelope.data))) !== envelope.sha256
      )
        throw new Error("Derived source hash mismatch");
      for (const source of envelope.sources) {
        const meta = JSON.parse(
          await readFile(
            resolve(this.directory, digest(Buffer.from(source.url)) + ".json"),
            "utf8",
          ),
        );
        if (meta.url !== source.url || meta.sha256 !== source.sha256)
          throw new Error("Derived source provenance mismatch");
      }
      return envelope.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async saveDerived(key: string, data: unknown, urls: string[]) {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid derived cache key");
    const previous = await this.derived<unknown>(key);
    if (previous !== undefined) {
      if (JSON.stringify(previous) !== JSON.stringify(data))
        throw new Error("Derived source conflicts with cached version");
      return;
    }
    const sources = await Promise.all(
      urls.map(async (url) => {
        const meta = JSON.parse(
          await readFile(
            resolve(this.directory, digest(Buffer.from(url)) + ".json"),
            "utf8",
          ),
        );
        return { url, sha256: String(meta.sha256) };
      }),
    );
    await writeFile(
      resolve(this.directory, `derived-${key}.json.gz`),
      gzipSync(
        JSON.stringify({
          data,
          sha256: digest(Buffer.from(JSON.stringify(data))),
          sources,
        }) + "\n",
      ),
      { flag: "wx" },
    );
  }
}

/** Read one named CSV in memory; never extract ZIP paths to disk. ZIP64/encryption are unsupported. */
export function unzipCsv(zip: Buffer, name: string): string {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Invalid ZIP directory");
  let offset = zip.readUInt32LE(end + 16);
  const entries = zip.readUInt16LE(end + 10);
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Invalid ZIP entry");
    const flags = zip.readUInt16LE(offset + 8),
      method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20),
      size = zip.readUInt32LE(offset + 24);
    const length = zip.readUInt16LE(offset + 28),
      extra = zip.readUInt16LE(offset + 30),
      comment = zip.readUInt16LE(offset + 32);
    const filename = zip
      .subarray(offset + 46, offset + 46 + length)
      .toString("utf8");
    if (filename === name) {
      if (flags & 1 || ![0, 8].includes(method) || size > 512 * 1024 * 1024)
        throw new Error("Unsupported ZIP format/size");
      const local = zip.readUInt32LE(offset + 42);
      if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50)
        throw new Error("Invalid ZIP local entry");
      const start =
        local +
        30 +
        zip.readUInt16LE(local + 26) +
        zip.readUInt16LE(local + 28);
      if (start + compressed > zip.length) throw new Error("Truncated ZIP");
      const body =
        method === 8
          ? inflateRawSync(zip.subarray(start, start + compressed), {
              maxOutputLength: 512 * 1024 * 1024,
            })
          : zip.subarray(start, start + compressed);
      if (body.length !== size) throw new Error("ZIP size mismatch");
      return body.toString("utf8");
    }
    offset += 46 + length + extra + comment;
  }
  throw new Error(`Missing ZIP CSV ${name}`);
}

export type OfficialGame = {
  id: number;
  season: number;
  gameType: number;
  gameStateId: number;
  gameDate: string;
  homeTeamId: number;
  visitingTeamId: number;
  homeScore: number;
  visitingScore: number;
};
export async function fetchSeasonGames(
  cache: HockeyDataCache,
  season: number,
  gameType: 2 | 3,
) {
  if (
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000 ||
    ![2, 3].includes(gameType)
  )
    throw new Error("Invalid game scope");
  const page = await cache.json<{ total: number; data: OfficialGame[] }>(
    `https://api.nhle.com/stats/rest/en/game?cayenneExp=season=${season}%20and%20gameType=${gameType}&limit=2000`,
  );
  if (
    !Array.isArray(page.data) ||
    page.data.length !== page.total ||
    new Set(page.data.map((g) => g.id)).size !== page.total ||
    page.data.some((g) => g.season !== season || g.gameType !== gameType)
  )
    throw new Error("Incomplete or mixed NHL game schedule");
  return page.data
    .filter((g) => g.gameStateId === 7)
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id - b.id);
}

export async function fetchGamePlayByPlay(
  cache: HockeyDataCache,
  gameId: number,
) {
  const raw = await cache.json<{
    id: number;
    plays: Array<{ eventId: number; details?: Record<string, unknown> }>;
  }>(`https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`);
  const supplement = await cache.derived<{
    gameId: number;
    eventIds: number[];
  }>(`penalty-shots-${gameId}`);
  if (!supplement) return raw;
  if (
    supplement.gameId !== raw.id ||
    raw.id !== gameId ||
    new Set(supplement.eventIds).size !== supplement.eventIds.length ||
    supplement.eventIds.some(
      (id) => raw.plays.filter((p) => p.eventId === id).length !== 1,
    )
  )
    throw new Error("Invalid penalty-shot supplement identity");
  return {
    ...raw,
    plays: raw.plays.map((p) =>
      supplement.eventIds.includes(p.eventId)
        ? { ...p, details: { ...p.details, nhlReportPenaltyShot: true } }
        : p,
    ),
  };
}

export async function repairGamePenaltyShots(
  cache: HockeyDataCache,
  gameId: number,
  totals: PenaltyShotGameTotal[],
  reportUrls: string[],
) {
  const pbp = await fetchGamePlayByPlay(cache, gameId);
  if (penaltyShotGameMatches(pbp, totals)) return;
  const year = Math.floor(gameId / 1e6),
    season = year * 10000 + year + 1;
  const url = `https://www.nhl.com/scores/htmlreports/${season}/PL${String(gameId % 1e6).padStart(6, "0")}.HTM`;
  const eventIds = parseOfficialPenaltyShots(
    (await cache.bytes(url)).toString("utf8"),
    pbp,
    totals,
  );
  await cache.saveDerived(`penalty-shots-${gameId}`, { gameId, eventIds }, [
    url,
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    ...reportUrls,
  ]);
}

export async function fetchGameSources(
  cache: HockeyDataCache,
  gameId: number,
  shiftSource?: "nhl-toi-report",
) {
  const derivedBox = await cache.derived<unknown>(`box-${gameId}`),
    derivedShifts = await cache.derived<unknown[]>(`shifts-${gameId}`);
  // Batch summary projections contain only rows explicitly reporting GP=1.
  // Preserve official zero-time appearances (for example a resumed game), while
  // direct boxscore backup goalies with zero TOI remain unconfirmed appearances.
  const officialBox = derivedBox as
    | {
        playerByGameStats: Record<
          string,
          Record<string, Array<Record<string, unknown>>>
        >;
      }
    | undefined;
  const appearanceBox = officialBox
    ? {
        ...officialBox,
        playerByGameStats: Object.fromEntries(
          Object.entries(officialBox.playerByGameStats).map(
            ([side, groups]) => [
              side,
              Object.fromEntries(
                Object.entries(groups).map(([group, players]) => [
                  group,
                  players.map((p) =>
                    p.toi === "0:00" ? { ...p, officialAppearance: true } : p,
                  ),
                ]),
              ),
            ],
          ),
        ),
      }
    : undefined;
  const [pbp, box] = await Promise.all([
    fetchGamePlayByPlay(cache, gameId),
    appearanceBox ??
      cache.json<unknown>(
        `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`,
      ),
  ]);
  const fromReports = async () => {
    // The reconciliation also depends on hash-verified API shift starts.
    const reportKey = `html-shifts-reconciled-v2-${gameId}-${digest(Buffer.from(JSON.stringify(derivedShifts ?? [])))}`;
    const cached = await cache.derived<unknown[]>(reportKey);
    if (cached)
      return {
        pbp,
        box,
        shifts: cached,
        shiftSource: "nhl-toi-report" as const,
      };
    const year = Math.floor(gameId / 1e6),
      season = year * 10000 + year + 1;
    const suffix = String(gameId % 1e6).padStart(6, "0");
    const urls = ["H", "V"].map(
      (side) =>
        `https://www.nhl.com/scores/htmlreports/${season}/T${side}${suffix}.HTM`,
    );
    const pages = await Promise.all(urls.map((url) => cache.bytes(url)));
    const shifts = [
      ...parseOfficialShiftReport(
        pages[0]!.toString("utf8"),
        pbp,
        true,
        derivedShifts,
      ),
      ...parseOfficialShiftReport(
        pages[1]!.toString("utf8"),
        pbp,
        false,
        derivedShifts,
      ),
    ];
    await cache.saveDerived(reportKey, shifts, [
      ...urls,
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    ]);
    return { pbp, box, shifts, shiftSource: "nhl-toi-report" as const };
  };
  if (shiftSource === "nhl-toi-report") return fromReports();
  if (derivedShifts)
    return derivedShifts.length
      ? { pbp, box, shifts: derivedShifts, shiftSource: "nhl-api" as const }
      : fromReports();
  const shifts: unknown[] = [];
  for (let start = 0; start < 10000; ) {
    const page = await cache.json<{ total: number; data: unknown[] }>(
      `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${gameId}&start=${start}&limit=2000`,
    );
    if (!Array.isArray(page.data)) throw new Error("Malformed NHL shifts");
    shifts.push(...page.data);
    if (shifts.length === page.total)
      return shifts.length
        ? { pbp, box, shifts, shiftSource: "nhl-api" as const }
        : fromReports();
    if (!page.data.length || shifts.length > page.total)
      throw new Error("Incomplete NHL shifts");
    start += page.data.length;
  }
  throw new Error("NHL shift pagination limit");
}

/** Public batch endpoints reduce request volume while preserving per-game source provenance. */
export async function prefetchSeasonSupport(
  cache: HockeyDataCache,
  games: OfficialGame[],
) {
  const ordered = [...games].sort((a, b) => a.id - b.id);
  for (let offset = 0; offset < ordered.length; offset += 100) {
    const batch = ordered.slice(offset, offset + 100);
    if (
      (await Promise.all(batch.map((g) => cache.derived(`box-${g.id}`)))).every(
        Boolean,
      ) &&
      (
        await Promise.all(batch.map((g) => cache.derived(`shifts-${g.id}`)))
      ).every(Boolean)
    )
      continue;
    const filter = `gameId>=${batch[0]!.id} and gameId<=${batch.at(-1)!.id}`;
    const ids = new Set(batch.map((g) => g.id));
    const rosterRows: Array<Record<string, unknown>> = [],
      rosterUrls: string[] = [];
    for (const kind of ["skater", "goalie"]) {
      const params = new URLSearchParams({
        isAggregate: "false",
        isGame: "true",
        start: "0",
        limit: "-1",
        cayenneExp: filter,
      });
      const url = `https://api.nhle.com/stats/rest/en/${kind}/summary?${params}`;
      const page = await cache.json<{
        total: number;
        data: Array<Record<string, unknown>>;
      }>(url);
      if (
        !Array.isArray(page.data) ||
        page.data.length !== page.total ||
        page.total >= 10000 ||
        page.data.some((p) => !ids.has(Number(p.gameId)) || p.gamesPlayed !== 1)
      )
        throw new Error("Invalid or truncated batch player-game report");
      rosterRows.push(...page.data.map((p) => ({ ...p, kind })));
      rosterUrls.push(url);
    }
    const shiftRows: Array<Record<string, unknown>> = [],
      shiftUrls: string[] = [];
    let expected: number | undefined;
    while (true) {
      const params = new URLSearchParams({
        cayenneExp: filter,
        start: String(shiftRows.length),
        limit: "10000",
        sort: JSON.stringify([{ property: "id", direction: "ASC" }]),
      });
      const url = `https://api.nhle.com/stats/rest/en/shiftcharts?${params}`;
      const page = await cache.json<{
        total: number;
        data: Array<Record<string, unknown>>;
      }>(url);
      if (
        !Array.isArray(page.data) ||
        (expected !== undefined && expected !== page.total) ||
        page.data.some((s) => !ids.has(Number(s.gameId)))
      )
        throw new Error("Invalid batch shift pagination");
      expected = page.total;
      shiftRows.push(...page.data);
      shiftUrls.push(url);
      if (shiftRows.length === expected) break;
      if (
        !page.data.length ||
        shiftRows.length > expected ||
        shiftRows.length > 200000
      )
        throw new Error("Incomplete batch shifts");
    }
    if (new Set(shiftRows.map((s) => s.id)).size !== shiftRows.length)
      throw new Error("Duplicate identities across batch shift pages");
    for (const game of batch) {
      const team = () => ({
        forwards: [] as unknown[],
        defense: [] as unknown[],
        goalies: [] as unknown[],
      });
      const homeTeam = team(),
        awayTeam = team();
      for (const p of rosterRows.filter((p) => p.gameId === game.id)) {
        if (!["H", "R"].includes(String(p.homeRoad)))
          throw new Error("Unknown player-game venue");
        const target = p.homeRoad === "H" ? homeTeam : awayTeam;
        const seconds = Number(
          p.kind === "goalie" ? p.timeOnIce : p.timeOnIcePerGame,
        );
        if (
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          !Number.isInteger(seconds)
        )
          throw new Error("Invalid player-game TOI");
        const row = {
          playerId: p.playerId,
          name: { default: p.skaterFullName ?? p.goalieFullName },
          position: p.kind === "goalie" ? "G" : p.positionCode,
          toi: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
          shotsAgainst: p.shotsAgainst ?? 0,
          goalsAgainst: p.goalsAgainst ?? 0,
        };
        (p.kind === "goalie"
          ? target.goalies
          : p.positionCode === "D"
            ? target.defense
            : target.forwards
        ).push(row);
      }
      if (
        !homeTeam.goalies.length ||
        !awayTeam.goalies.length ||
        homeTeam.forwards.length < 3 ||
        awayTeam.forwards.length < 3
      )
        throw new Error("Incomplete batch boxscore projection");
      await cache.saveDerived(
        `box-${game.id}`,
        {
          id: game.id,
          gameDate: game.gameDate,
          playerByGameStats: { homeTeam, awayTeam },
        },
        rosterUrls,
      );
      await cache.saveDerived(
        `shifts-${game.id}`,
        shiftRows.filter((s) => s.gameId === game.id),
        shiftUrls,
      );
    }
    console.log(
      `Cached batch roster and shift sources for ${Math.min(offset + 100, ordered.length)}/${ordered.length} games`,
    );
  }
}
