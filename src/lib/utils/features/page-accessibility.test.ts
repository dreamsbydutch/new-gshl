import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

void test("contextual layouts expose a labelled main landmark", () => {
  for (const [path, headingId] of [
    ["src/components/schedule/ScheduleLayout.tsx", "schedule-page-heading"],
    ["src/components/standings/StandingsLayout.tsx", "standings-page-heading"],
    [
      "src/components/locker-room/LockerRoomLayout.tsx",
      "locker-room-page-heading",
    ],
    [
      "src/components/league-office/LeagueOfficeLayout.tsx",
      "league-office-page-heading",
    ],
  ] as const) {
    const source = readSource(path);

    assert.match(source, new RegExp(`<main aria-labelledby="${headingId}">`));
    assert.match(
      source,
      new RegExp(`<h1 id="${headingId}" className="sr-only">`),
    );
  }
});

void test("protected contextual loading routes retain a labelled primary landmark", () => {
  for (const [path, headingId] of [
    [
      "src/components/skeletons/LockerRoomSkeleton.tsx",
      "locker-room-loading-heading",
    ],
    [
      "src/components/skeletons/LeagueOfficeSkeleton.tsx",
      "league-office-loading-heading",
    ],
  ] as const) {
    const source = readSource(path);

    assert.match(source, new RegExp(`<main aria-labelledby="${headingId}">`));
    assert.match(
      source,
      new RegExp(`<h1 id="${headingId}" className="sr-only">`),
    );
  }
});

void test("nested route loading UI does not introduce a second main landmark", () => {
  for (const [path, skeletonName] of [
    ["src/app/lockerroom/loading.tsx", "LockerRoomSkeleton"],
    ["src/app/leagueoffice/loading.tsx", "LeagueOfficeSkeleton"],
  ] as const) {
    const source = readSource(path);

    assert.match(source, new RegExp(`<${skeletonName} \\/>`));
    assert.doesNotMatch(source, /RouteSkeleton/);
  }
});

void test("the standalone Rulebook owns the landmark while shared content stays nestable", () => {
  const route = readSource("src/app/rulebook/page.tsx");
  const content = readSource("src/components/league-office/Rulebook.tsx");

  assert.match(route, /aria-labelledby="rulebook-page-heading"/);
  assert.match(route, /<h1 id="rulebook-page-heading" className="sr-only">/);
  assert.doesNotMatch(content, /<main/);
  assert.match(content, /<article className="rulebook-page/);
  assert.match(content, /<h2[^>]*>GSHL Rulebook<\/h2>/);
});

void test("Locker Room and League Office feature headings stay below the route h1", () => {
  for (const path of [
    "src/components/locker-room/LockerRoomContent.tsx",
    "src/components/team/LockerRoomHeader.tsx",
    "src/components/league-office/ConferenceContest.tsx",
    "src/components/league-office/ImageUpload.tsx",
    "src/components/league-office/LeagueOfficeMockDraft.tsx",
    "src/components/league-office/Newsroom.tsx",
    "src/components/league-office/OwnerRankings.tsx",
    "src/components/league-office/Rulebook.tsx",
    "src/components/contracts/UfaSigning.tsx",
    "src/components/admin/ContractManagement.tsx",
    "src/components/admin/JobManagement.tsx",
    "src/components/auth/UserManagement.tsx",
  ]) {
    assert.doesNotMatch(readSource(path), /<h1(?:\s|>)/);
  }
});

void test("matchup loading, error, empty, and success states retain an h1", () => {
  const content = readSource(
    "src/components/matchup/MatchupDetailsContent.tsx",
  );
  const routeContent = readSource(
    "src/components/matchup/MatchupPageContent.tsx",
  );
  const skeleton = readSource("src/components/skeletons/MatchupSkeleton.tsx");

  for (const headingId of [
    "matchup-error-heading",
    "matchup-not-found-heading",
    "matchup-page-heading",
  ]) {
    assert.match(content, new RegExp(`aria-labelledby="${headingId}"`));
    assert.match(content, new RegExp(`<h1[^>]*id="${headingId}"`));
  }

  assert.match(skeleton, /aria-labelledby="matchup-loading-heading"/);
  assert.match(skeleton, /<h1[^>]*id="matchup-loading-heading"/);
  assert.match(
    routeContent,
    /aria-labelledby="matchup-route-not-found-heading"/,
  );
  assert.match(routeContent, /<h1[^>]*id="matchup-route-not-found-heading"/);
});

void test("team schedule rows implement a labelled disclosure", () => {
  const source = readSource(
    "src/components/team/schedule/TeamScheduleItem.tsx",
  );

  assert.match(
    source,
    /aria-controls=\{canExpand \? disclosureId : undefined\}/,
  );
  assert.match(source, /aria-expanded=\{canExpand \? isExpanded : undefined\}/);
  assert.match(source, /disabled=\{!canExpand\}/);
  assert.match(
    source,
    /id=\{disclosureId\} role="region" aria-labelledby=\{triggerId\}/,
  );
});

void test("shared dropdown navigation uses a labelled native select", () => {
  const source = readSource("src/components/nav/Toggle.tsx");

  assert.match(source, /<select\s+aria-label=\{ariaLabel\}/);
  assert.match(source, /<option key=\{getItemKey\(item\)\}/);
});

void test("global styles respect reduced-motion preferences", () => {
  const source = readSource("src/styles/globals.css");

  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /animation-duration: 0\.01ms !important/);
  assert.match(source, /transition-duration: 0\.01ms !important/);
});

void test("the Press Box modal portals outside inert content and manages focus", () => {
  const source = readSource(
    "src/components/headlines/WeeklyEditionHomeCard.tsx",
  );

  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body,/);
  assert.match(source, /element\.inert = true/);
  assert.match(source, /element\.inert = inert/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /const trigger = triggerRef\.current/);
  assert.match(source, /trigger\?\.focus\(\)/);
  assert.match(source, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(source, /pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(source, /sm:pt-\[max\(0\.75rem,env\(safe-area-inset-top\)\)\]/);
  assert.match(
    source,
    /sm:pb-\[max\(0\.75rem,env\(safe-area-inset-bottom\)\)\]/,
  );
});
