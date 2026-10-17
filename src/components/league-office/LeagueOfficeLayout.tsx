"use client";
import Link from "next/link";
import { useLeagueOfficeContextNavigation } from "@gshl-hooks";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";
import { LeagueOfficeSkeleton } from "@gshl-skeletons";
export function LeagueOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigation = useLeagueOfficeContextNavigation();
  const leagueView =
    navigation.selectedView === "ownerRankings" ||
    navigation.selectedView === "confBattle";
  return (
    <>
      <SectionNavigation section={leagueView ? "league" : "players"} />
      {leagueView ||
      navigation.selectedView === "draft" ||
      navigation.isMockDraftPage ? (
        <div className="gshl-local-controls">
          <nav
            aria-label={leagueView ? "League comparisons" : "Draft tools"}
            className="mx-auto flex max-w-6xl gap-4 px-3 sm:px-5"
          >
            {leagueView ? (
              <>
                <Link
                  className="gshl-text-action"
                  href="/leagueoffice?view=ownerRankings"
                  aria-current={
                    navigation.selectedView === "ownerRankings"
                      ? "page"
                      : undefined
                  }
                >
                  Owner rankings
                </Link>
                <Link
                  className="gshl-text-action"
                  href="/leagueoffice?view=confBattle"
                  aria-current={
                    navigation.selectedView === "confBattle"
                      ? "page"
                      : undefined
                  }
                >
                  Conference contest
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="gshl-text-action"
                  href="/leagueoffice?view=draft"
                >
                  Draft classes
                </Link>
                {navigation.showMockDraft ? (
                  <Link
                    className="gshl-text-action"
                    href="/leagueoffice/mock-draft"
                    aria-current={
                      navigation.isMockDraftPage ? "page" : undefined
                    }
                  >
                    Mock draft
                  </Link>
                ) : null}
              </>
            )}
          </nav>
        </div>
      ) : null}
      <main
        aria-label={leagueView ? "League comparisons" : "Player acquisition"}
      >
        {navigation.isReady ? children : <LeagueOfficeSkeleton />}
      </main>
    </>
  );
}
