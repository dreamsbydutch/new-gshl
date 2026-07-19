"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  FileCheck2,
  Info,
  Printer,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
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

const calloutStyles: Record<
  RulebookCalloutType,
  { className: string; icon: typeof Info }
> = {
  official: {
    className:
      "border-sunview-300 bg-sunview-50 text-sunview-900 dark:border-sunview-600 dark:bg-sunview-900/40 dark:text-sunview-100",
    icon: FileCheck2,
  },
  important: {
    className:
      "border-hotel-300 bg-hotel-50 text-hotel-900 dark:border-hotel-600 dark:bg-hotel-900/40 dark:text-hotel-100",
    icon: CircleAlert,
  },
  example: {
    className:
      "border-champ-700 bg-champ-100 text-amber-950 dark:border-champ-700 dark:bg-amber-950/50 dark:text-champ-100",
    icon: Sparkles,
  },
  commissioner: {
    className:
      "border-brown-400 bg-brown-100 text-brown-900 dark:border-brown-600 dark:bg-brown-900/50 dark:text-brown-100",
    icon: ShieldAlert,
  },
  algorithm: {
    className:
      "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-600 dark:bg-violet-950/50 dark:text-violet-100",
    icon: Sparkles,
  },
  info: {
    className:
      "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
    icon: Info,
  },
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
        className="rounded-sm bg-champ-500 px-0.5 text-inherit"
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
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            {block.headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn(
                  "px-4 py-3 font-semibold",
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
            <tr
              key={`${row[0]}-${rowIndex}`}
              className="even:bg-slate-50/60 dark:even:bg-slate-900/60"
            >
              {row.map((cell, columnIndex) => (
                <td
                  key={`${cell}-${columnIndex}`}
                  className={cn(
                    "px-4 py-2.5 text-foreground/85",
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
  const style = calloutStyles[block.variant];
  const Icon = style.icon;

  return (
    <aside className={cn("rounded-lg border-l-4 p-4", style.className)}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="text-sm font-bold uppercase tracking-wide">
            <Highlight text={block.title} query={query} />
          </p>
          {block.content.map((content) => (
            <p key={content} className="text-sm leading-6">
              <Highlight text={content} query={query} />
            </p>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Block({ block, query }: { block: RulebookBlock; query: string }) {
  if (block.type === "paragraph") {
    return (
      <p className="leading-7 text-foreground/80">
        <Highlight text={block.text} query={query} />
      </p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul className="ml-5 list-disc space-y-2 text-foreground/80 marker:text-sunview-500">
        {block.items.map((item) => (
          <li key={item} className="pl-1 leading-7">
            <Highlight text={item} query={query} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "ordered") {
    return (
      <ol className="ml-5 list-decimal space-y-2 text-foreground/80 marker:font-bold marker:text-sunview-600">
        {block.items.map((item) => (
          <li key={item} className="pl-1 leading-7">
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
      className="scroll-mt-28 border-t py-7 first:border-t-0 first:pt-2 focus:outline-none"
    >
      <h3 className="mb-4 flex items-baseline gap-3 text-xl font-bold tracking-tight">
        <span className="font-barlow text-sunview-600">
          <Highlight text={rule.number} query={query} />
        </span>
        <span>
          <Highlight text={rule.title} query={query} />
        </span>
      </h3>
      <div className="space-y-4 text-[0.975rem]">
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
      className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-sunview-400"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${section.id}-rules`}
        className="group flex w-full items-center gap-4 bg-gradient-to-r from-sunview-50 via-background to-hotel-50 px-5 py-5 text-left transition-colors hover:from-sunview-100 hover:to-hotel-100 dark:from-sunview-900/50 dark:to-hotel-900/50 dark:hover:from-sunview-900/70 dark:hover:to-hotel-900/70 sm:px-7"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sunview-700 font-barlow text-2xl text-white shadow-sm">
          {section.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-barlow text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Section {section.number}
          </span>
          <span className="mt-0.5 block text-lg font-bold leading-tight sm:text-xl">
            <Highlight text={section.title} query={query} />
          </span>
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
        className="px-5 sm:px-7"
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
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rulebookSections.map((section) => [section.id, true])),
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

  const copyPageLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="rulebook-page mx-auto w-full max-w-7xl font-varela">
      <header className="relative mb-8 overflow-hidden rounded-2xl border bg-slate-950 px-6 py-9 text-white shadow-lg sm:px-10 sm:py-11">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-sunview-400" />
        <div className="absolute inset-y-0 right-0 w-1.5 bg-hotel-400" />
        <div className="relative">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Official league reference
          </div>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h1 className="font-barlow text-4xl font-bold tracking-tight sm:text-5xl">
                GSHL Rulebook
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                League rules, scoring, salary cap, contracts, and draft
                procedures
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Last updated {RULEBOOK_LAST_UPDATED}
              </p>
            </div>
            <div className="rulebook-actions flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyPageLink()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="rulebook-search-panel mb-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <label
          htmlFor="rulebook-search"
          className="mb-2 block text-sm font-bold"
        >
          Search the rulebook
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="rulebook-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try ‘buyouts’, ‘9.15’, or ‘goalie appearances’"
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition placeholder:text-muted-foreground focus:border-sunview-400 focus:ring-2 focus:ring-sunview-200"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear rulebook search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-sunview-400"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {normalizedQuery
            ? `${totalMatches} matching ${totalMatches === 1 ? "rule" : "rules"}`
            : "Search by rule number, title, or wording."}
        </p>
      </div>

      <div className="rulebook-mobile-jump mb-5 lg:hidden">
        <label htmlFor="rulebook-jump" className="mb-2 block text-sm font-bold">
          Jump to section
        </label>
        <select
          id="rulebook-jump"
          value={activeSection}
          onChange={(event) => goToSection(event.target.value)}
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-sunview-400"
        >
          {rulebookSections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.number}. {section.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-7 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <nav
          className="rulebook-toc sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-card p-3 shadow-sm lg:block"
          aria-label="Rulebook table of contents"
        >
          <p className="px-3 pb-2 pt-1 font-barlow text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Contents
          </p>
          <ol className="space-y-1">
            {rulebookSections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    goToSection(section.id);
                  }}
                  aria-current={
                    activeSection === section.id ? "location" : undefined
                  }
                  className={cn(
                    "flex gap-2 rounded-lg px-3 py-2 text-sm leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-sunview-400",
                    activeSection === section.id
                      ? "bg-sunview-100 font-bold text-sunview-800"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="w-5 shrink-0 font-barlow font-bold">
                    {section.number}
                  </span>
                  <span>{section.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-5">
          {filteredSections.map(({ section, rules }) => (
            <Section
              key={section.id}
              section={section}
              rules={rules}
              expanded={expanded[section.id] ?? true}
              query={query}
              onToggle={() =>
                setExpanded((current) => ({
                  ...current,
                  [section.id]: !(current[section.id] ?? true),
                }))
              }
            />
          ))}

          {filteredSections.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
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
                className="mt-5 rounded-lg bg-sunview-700 px-4 py-2 text-sm font-bold text-white hover:bg-sunview-800 focus:outline-none focus:ring-2 focus:ring-sunview-400 focus:ring-offset-2"
              >
                Clear search
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
