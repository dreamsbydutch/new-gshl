import { ArrowRight } from "lucide-react";

function Stage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex h-full flex-col justify-center gap-2">
        {children}
      </div>
    </div>
  );
}

function Matchup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border bg-background px-3 py-2 text-center text-xs leading-5 text-foreground/80">
      {children}
    </div>
  );
}

function Connector({ afterLabel = false }: { afterLabel?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center text-muted-foreground ${afterLabel ? "pt-6" : ""}`}
      aria-hidden="true"
    >
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}

export function PlayoffStructureBracket() {
  return (
    <figure
      className="mb-5 border-b pb-5"
      aria-labelledby="playoff-bracket-caption"
    >
      <figcaption
        id="playoff-bracket-caption"
        className="mb-3 text-sm font-semibold"
      >
        Playoff structure
      </figcaption>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[40rem] grid-cols-[1fr_2rem_1fr_2rem_1fr] gap-2 rounded-md bg-muted/25 p-3">
          <Stage title="First Round">
            <Matchup>Sunview: 1st vs. 4th</Matchup>
            <Matchup>Sunview: 2nd vs. 3rd</Matchup>
            <Matchup>Hickory Hotel: 1st vs. 4th</Matchup>
            <Matchup>Hickory Hotel: 2nd vs. 3rd</Matchup>
          </Stage>
          <Connector afterLabel />
          <Stage title="Conference Championships">
            <Matchup>Sunview first-round winners</Matchup>
            <Matchup>Hickory Hotel first-round winners</Matchup>
          </Stage>
          <Connector afterLabel />
          <Stage title="GSHL Cup Final">
            <Matchup>Conference champions</Matchup>
          </Stage>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A crossover changes conference placement only; it still produces two
        four-team brackets.
      </p>
    </figure>
  );
}

export function DraftOrderStructureBracket() {
  return (
    <figure
      className="mb-5 border-b pb-5"
      aria-labelledby="draft-order-bracket-caption"
    >
      <figcaption
        id="draft-order-bracket-caption"
        className="mb-3 text-sm font-semibold"
      >
        Draft-order placement games
      </figcaption>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold">Picks 1–6</p>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[48rem] grid-cols-[1fr_2rem_1.15fr_2rem_1fr] gap-2 rounded-md bg-muted/25 p-3">
              <Stage title="Week 1">
                <Matchup>9th vs. 10th</Matchup>
                <Matchup>11th vs. 12th</Matchup>
                <Matchup>13th vs. 14th</Matchup>
              </Stage>
              <Connector afterLabel />
              <Stage title="Week 2">
                <Matchup>Winner 11/12 vs. Winner 13/14</Matchup>
                <Matchup>Winner 9/10 vs. Loser 13/14</Matchup>
                <Matchup>
                  Loser 9/10 vs. Loser 11/12 begins two-week matchup
                </Matchup>
              </Stage>
              <Connector afterLabel />
              <Stage title="Week 3">
                <Matchup>Semifinal winners → Winner: 1 / Loser: 2</Matchup>
                <Matchup>Semifinal losers → Winner: 3 / Loser: 4</Matchup>
                <Matchup>Two-week matchup → Winner: 5 / Loser: 6</Matchup>
              </Stage>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold">Picks 7–10</p>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[34rem] grid-cols-[1fr_2rem_1fr] gap-2 rounded-md bg-muted/25 p-3">
              <Stage title="Week 2">
                <Matchup>Sunview first-round losers play</Matchup>
                <Matchup>Hickory Hotel first-round losers play</Matchup>
              </Stage>
              <Connector afterLabel />
              <Stage title="Week 3">
                <Matchup>Week 2 winners → Winner: 7 / Loser: 8</Matchup>
                <Matchup>Week 2 losers → Winner: 9 / Loser: 10</Matchup>
              </Stage>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold">Picks 11–14</p>
          <div className="grid gap-2 rounded-md bg-muted/25 p-3 sm:grid-cols-3">
            <Matchup>Conference Championship losers</Matchup>
            <Matchup>Winner → Pick 11 · Loser → Pick 12</Matchup>
            <Matchup>Runner-Up → Pick 13 · Champion → Pick 14</Matchup>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The GSHL App publishes the seeded bracket and home-team assignments
        before playoff week one.
      </p>
    </figure>
  );
}
