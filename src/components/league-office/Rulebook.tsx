"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Printer, Search, X } from "lucide-react";
import { cn } from "@gshl-utils";
import {
  getRulebookSearchText,
  RULEBOOK_LAST_UPDATED,
  rulebookSections,
  type RulebookBlock,
  type RulebookCalloutType,
  type RulebookRule,
  type RulebookSection,
} from "../../content/rulebook";

const calloutLabels: Record<RulebookCalloutType, string> = {
  official: "Official source",
  important: "Important",
  example: "Example",
  commissioner: "Commissioner discretion",
  algorithm: "System-generated result",
  info: "Note",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;

  const expression = new RegExp(
    `(${tokens.map(escapeRegExp).join("|")})`,
    "gi",
  );
  return text.split(expression).map((part, index) =>
    tokens.some(
      (token) => part.toLocaleLowerCase() === token.toLocaleLowerCase(),
    ) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-yellow-200 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function RulebookTable({
  block,
  query,
}: {
  block: Extract<RulebookBlock, { type: "table" }>;
  query: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-xs text-muted-foreground">
          <tr>
            {block.headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn(
                  "px-3 py-2.5 font-semibold",
                  block.numericColumns?.includes(index) && "text-right",
                )}
              >
                <Highlight text={header} query={query} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {block.rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`} className="even:bg-muted/30">
              {row.map((cell, columnIndex) => (
                <td
                  key={`${cell}-${columnIndex}`}
                  className={cn(
                    "px-3 py-2.5 text-foreground/80",
                    block.numericColumns?.includes(columnIndex) &&
                      "text-right font-mono tabular-nums",
                  )}
                >
                  <Highlight text={cell} query={query} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulebookCallout({
  block,
  query,
}: {
  block: Extract<RulebookBlock, { type: "callout" }>;
  query: string;
}) {
  return (
    <aside className="border-l-2 border-foreground/25 py-0.5 pl-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">
          {calloutLabels[block.variant]} ·{" "}
          <Highlight text={block.title} query={query} />
        </p>
        {block.content.map((content) => (
          <p key={content} className="text-sm leading-6 text-foreground/80">
            <Highlight text={content} query={query} />
          </p>
        ))}
      </div>
    </aside>
  );
}

function Block({ block, query }: { block: RulebookBlock; query: string }) {
  if (block.type === "paragraph") {
    return (
      <p className="leading-6 text-foreground/80">
        <Highlight text={block.text} query={query} />
      </p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul className="ml-5 list-disc space-y-1.5 text-foreground/80">
        {block.items.map((item) => (
          <li key={item} className="pl-1 leading-6">
            <Highlight text={item} query={query} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "ordered") {
    return (
      <ol className="ml-5 list-decimal space-y-1.5 text-foreground/80 marker:font-semibold">
        {block.items.map((item) => (
          <li key={item} className="pl-1 leading-6">
            <Highlight text={item} query={query} />
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "table") {
    return <RulebookTable block={block} query={query} />;
  }

  return <RulebookCallout block={block} query={query} />;
}

function Rule({ rule, query }: { rule: RulebookRule; query: string }) {
  return (
    <article
      id={rule.id}
      tabIndex={-1}
      className="scroll-mt-28 border-t py-5 first:border-t-0 first:pt-1 focus:outline-none"
    >
      <h3 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
        <span className="font-barlow text-sm text-muted-foreground">
          <Highlight text={rule.number} query={query} />
        </span>
        <span>
          <Highlight text={rule.title} query={query} />
        </span>
      </h3>
      <div className="space-y-3 text-sm">
        {rule.blocks.map((block, index) => (
          <Block key={`${rule.id}-${index}`} block={block} query={query} />
        ))}
      </div>
    </article>
  );
}

function Section({
  section,
  rules,
  expanded,
  query,
  onToggle,
}: {
  section: RulebookSection;
  rules: RulebookRule[];
  expanded: boolean;
  query: string;
  onToggle: () => void;
}) {
  return (
    <section
      id={section.id}
      data-rulebook-section
      tabIndex={-1}
      className="scroll-mt-24 overflow-hidden rounded-lg border bg-card focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${section.id}-rules`}
        className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5"
      >
        <span className="w-5 shrink-0 font-barlow text-sm font-semibold text-muted-foreground">
          {section.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight">
            <Highlight text={section.title} query={query} />
          </span>
        </span>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {rules.length} {rules.length === 1 ? "rule" : "rules"}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={`${section.id}-rules`}
        hidden={!expanded}
        className="px-4 sm:px-5"
      >
        {rules.map((rule) => (
          <Rule key={rule.id} rule={rule} query={query} />
        ))}
      </div>
    </section>
  );
}

export function Rulebook() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(rulebookSections[0]!.id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rulebookSections.map((section) => [section.id, false])),
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );

  const filteredSections = useMemo(() => {
    if (queryTokens.length === 0) {
      return rulebookSections.map((section) => ({
        section,
        rules: section.rules,
      }));
    }

    return rulebookSections
      .map((section) => ({
        section,
        rules: section.rules.filter((rule) => {
          const searchText = getRulebookSearchText(section, rule);
          return queryTokens.every((token) => searchText.includes(token));
        }),
      }))
      .filter(({ rules }) => rules.length > 0);
  }, [queryTokens]);

  const totalMatches = filteredSections.reduce(
    (sum, section) => sum + section.rules.length,
    0,
  );

  const openAndFocusHash = useCallback(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;

    const parentSection = rulebookSections.find(
      (section) =>
        section.id === id || section.rules.some((rule) => rule.id === id),
    );
    if (!parentSection) return;

    setExpanded((current) => ({ ...current, [parentSection.id]: true }));
    window.setTimeout(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    }, 40);
  }, []);

  useEffect(() => {
    openAndFocusHash();
    window.addEventListener("hashchange", openAndFocusHash);
    return () => window.removeEventListener("hashchange", openAndFocusHash);
  }, [openAndFocusHash]);

  useEffect(() => {
    if (normalizedQuery) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-18% 0px -72% 0px", threshold: 0 },
    );

    document
      .querySelectorAll<HTMLElement>("[data-rulebook-section]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) return;
    setExpanded((current) => ({
      ...current,
      ...Object.fromEntries(
        filteredSections.map(({ section }) => [section.id, true]),
      ),
    }));
  }, [filteredSections, normalizedQuery]);

  const goToSection = (id: string) => {
    setExpanded((current) => ({ ...current, [id]: true }));
    window.history.replaceState(null, "", `#${id}`);
    window.setTimeout(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    }, 20);
  };

  return (
    <main className="rulebook-page mx-auto w-full max-w-4xl font-varela">
      <header className="mb-6 text-center">
        <div className="flex items-start justify-center gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">GSHL Rulebook</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              League rules and reference information
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Last updated {RULEBOOK_LAST_UPDATED}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print rulebook"
            className="rulebook-actions mt-0.5 rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="rulebook-search-panel mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div>
          <label htmlFor="rulebook-search" className="sr-only">
            Search the rulebook
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="rulebook-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-10 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear rulebook search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        <label htmlFor="rulebook-jump" className="sr-only">
          Jump to section
        </label>
        <select
          id="rulebook-jump"
          value={activeSection}
          onChange={(event) => goToSection(event.target.value)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {rulebookSections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.number}. {section.title}
            </option>
          ))}
        </select>
      </div>

      {normalizedQuery ? (
        <p
          className="mb-4 text-center text-xs text-muted-foreground"
          aria-live="polite"
        >
          {totalMatches} matching {totalMatches === 1 ? "rule" : "rules"}
        </p>
      ) : null}

      <div className="min-w-0 space-y-3">
        {filteredSections.map(({ section, rules }) => (
          <Section
            key={section.id}
            section={section}
            rules={rules}
            expanded={expanded[section.id] ?? false}
            query={query}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [section.id]: !(current[section.id] ?? false),
              }))
            }
          />
        ))}

        {filteredSections.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <Search
              className="mx-auto h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-bold">No matching rules</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a broader term or search by a rule number.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Clear search
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
