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

const draftOrderPaths = [
  {
    entrants: "Teams finishing 9th–14th",
    stage: "Draft-Order Tournament",
    result: "Picks 1–6",
  },
  {
    entrants: "First-round playoff losers",
    stage: "Consolation bracket",
    result: "Picks 7–10",
  },
  {
    entrants: "Conference Championship losers",
    stage: "Final-week matchup",
    result: "Picks 11–12",
  },
  {
    entrants: "Cup Runner-Up / Champion",
    stage: "Final placement",
    result: "Picks 13 / 14",
  },
];

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
        Draft-order structure
      </figcaption>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[40rem] space-y-2 rounded-md bg-muted/25 p-3">
          <div className="grid grid-cols-[1fr_2rem_1fr_2rem_0.65fr] gap-2 px-1 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Entrants</span>
            <span />
            <span>Competition</span>
            <span />
            <span>Draft picks</span>
          </div>
          {draftOrderPaths.map((path) => (
            <div
              key={path.result}
              className="grid grid-cols-[1fr_2rem_1fr_2rem_0.65fr] gap-2"
            >
              <Matchup>{path.entrants}</Matchup>
              <Connector />
              <Matchup>{path.stage}</Matchup>
              <Connector />
              <Matchup>{path.result}</Matchup>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The GSHL App publishes the detailed picks 1–6 matchup paths before
        playoff week one.
      </p>
    </figure>
  );
}
