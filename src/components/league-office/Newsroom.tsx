"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  FileClock,
  House,
  LoaderCircle,
  Newspaper,
  Save,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useSeasons, useWeeklyEditionNewsroom, useWeeks } from "@gshl-hooks";
import type {
  WeeklyEdition,
  WeeklyEditionContent,
  WeeklyEditionValidationResult,
} from "@gshl-types";
import {
  validateWeeklyEditionContent,
  validateWeeklyEditionImport,
} from "@gshl-utils";
import { Button } from "@gshl-ui";
import { WeeklyEditionArticle } from "../headlines/WeeklyEditionArticle";
import { WeeklyEditionEditor } from "../headlines/WeeklyEditionEditor";

export function Newsroom() {
  const [editionId, setEditionId] = useState("");
  const newsroom = useWeeklyEditionNewsroom(editionId);
  const [rawImport, setRawImport] = useState("");
  const [importResult, setImportResult] =
    useState<WeeklyEditionValidationResult | null>(null);
  const [manualContent, setManualContent] =
    useState<WeeklyEditionContent | null>(null);
  const [manualErrors, setManualErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [weekId, setWeekId] = useState("");
  const [issueType, setIssueType] = useState("weekly");
  const seasons = useSeasons({ orderBy: { year: "desc" } });
  const weeks = useWeeks({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const selectedEdition = useMemo(
    () => newsroom.editions?.find((edition) => edition.id === editionId),
    [editionId, newsroom.editions],
  );
  const activeArticleCount =
    selectedEdition?.content.sections.filter(
      (section) => !selectedEdition.inactiveSectionIds?.includes(section.id),
    ).length ?? 0;

  useEffect(() => {
    if (!editionId && newsroom.editions?.[0]) {
      setEditionId(newsroom.editions[0].id);
    }
  }, [editionId, newsroom.editions]);

  useEffect(() => {
    setManualContent(selectedEdition?.content ?? null);
    setManualErrors([]);
    setRawImport("");
    setImportResult(null);
    setNotice("");
  }, [selectedEdition]);

  const showNotice = (value: string) => {
    setNotice(value);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const copyPrompt = async () => {
    if (!newsroom.prompt) return;
    try {
      await navigator.clipboard.writeText(newsroom.prompt);
      showNotice("ChatGPT prompt copied.");
    } catch {
      showNotice("Unable to copy the ChatGPT prompt.");
    }
  };

  const validateImport = () => {
    if (!selectedEdition) return;
    setImportResult(
      validateWeeklyEditionImport(rawImport, selectedEdition.facts),
    );
  };

  const publishImport = async () => {
    if (!selectedEdition || !importResult?.valid) return;
    await newsroom.publishImport.mutateAsync({
      editionId: selectedEdition.id,
      raw: rawImport,
    });
    showNotice("Validated ChatGPT replacement published.");
  };

  const saveManual = async () => {
    if (!selectedEdition || !manualContent) return;
    const result = validateWeeklyEditionContent(
      manualContent,
      selectedEdition.facts,
    );
    setManualErrors(result.errors);
    if (!result.valid || !result.content) return;
    await newsroom.updateManual.mutateAsync({
      editionId: selectedEdition.id,
      content: result.content,
    });
    showNotice("Manual revision published.");
  };

  const generate = async () => {
    if (!seasonId || !weekId) return;
    const result = await newsroom.generateHistorical.mutateAsync({
      seasonId,
      weekId,
      issueType,
    });
    const generated = result as {
      state?: string;
      edition?: WeeklyEdition;
    };
    if (generated.edition?.id) setEditionId(generated.edition.id);
    showNotice(`Edition ${generated.state ?? "generated"}.`);
  };

  const toggleVisibility = async () => {
    if (!selectedEdition) return;
    await newsroom.setVisibility.mutateAsync({
      editionId: selectedEdition.id,
      status: selectedEdition.status === "published" ? "hidden" : "published",
    });
    showNotice(
      selectedEdition.status === "published"
        ? "Edition hidden from readers."
        : "Edition restored to the archive.",
    );
  };

  const toggleHomeActive = async () => {
    if (!selectedEdition) return;
    await newsroom.setHomeActive.mutateAsync({
      editionId: selectedEdition.isHomeActive ? undefined : selectedEdition.id,
    });
    showNotice(
      selectedEdition.isHomeActive
        ? "No newsletter is active on the homepage."
        : "This is now the only newsletter active on the homepage.",
    );
  };

  const clearHomeActive = async () => {
    await newsroom.setHomeActive.mutateAsync({});
    showNotice("No newsletter is active on the homepage.");
  };

  const toggleSectionActive = async (
    sectionId: string,
    currentlyActive: boolean,
  ) => {
    if (!selectedEdition) return;
    await newsroom.setSectionActive.mutateAsync({
      editionId: selectedEdition.id,
      sectionId,
      active: !currentlyActive,
    });
    showNotice(
      currentlyActive
        ? "Article turned off for readers."
        : "Article turned on for readers.",
    );
  };

  const mutationError =
    newsroom.generateHistorical.error ??
    newsroom.publishImport.error ??
    newsroom.updateManual.error ??
    newsroom.setVisibility.error ??
    newsroom.setHomeActive.error ??
    newsroom.setSectionActive.error ??
    newsroom.restoreRevision.error;

  return (
    <section className="mx-auto max-w-7xl space-y-6 py-6">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">
          Commissioner tools
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-oswald text-3xl font-bold text-slate-950">
          <Newspaper className="h-7 w-7" aria-hidden="true" />
          GSHL Press Box Newsroom
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Weekly and season-milestone editions publish automatically. ChatGPT is
          optional: copy the grounded prompt, use it in ChatGPT Free or Plus,
          then paste only its JSON response here. No API key or paid API call is
          involved.
        </p>
      </header>

      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {mutationError ? (
        <p
          role="alert"
          className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {mutationError.message}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Generate a completed week
          <select
            value={seasonId}
            onChange={(event) => {
              setSeasonId(event.target.value);
              setWeekId("");
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Choose season</option>
            {seasons.data.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name || season.year}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Week
          <select
            value={weekId}
            disabled={!seasonId}
            onChange={(event) => setWeekId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
          >
            <option value="">Choose week</option>
            {weeks.data.map((week) => (
              <option key={week.id} value={week.id}>
                Week {week.weekNum} · {week.endDate}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Edition type
          <select
            value={issueType}
            onChange={(event) => setIssueType(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="weekly">Weekly recap</option>
            <option value="final_recap">Final recap</option>
            <option value="resigning_outlook">Re-signing outlook</option>
            <option value="offseason_market">Offseason market</option>
            <option value="pre_draft">Pre-draft issue</option>
            <option value="preseason">Preseason preview</option>
          </select>
        </label>
        <Button
          type="button"
          className="self-end"
          disabled={
            !seasonId || !weekId || newsroom.generateHistorical.isPending
          }
          onClick={() => void generate()}
        >
          {newsroom.generateHistorical.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Sparkles />
          )}
          Generate or refresh template
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-20">
          <h2 className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Editions
          </h2>
          {newsroom.isLoading ? (
            <p className="p-3 text-sm text-slate-500">Loading editions…</p>
          ) : newsroom.editions?.length ? (
            <div className="max-h-[34rem] space-y-1 overflow-y-auto">
              {newsroom.editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  onClick={() => setEditionId(edition.id)}
                  className={`block w-full rounded-lg px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    edition.id === editionId
                      ? "bg-slate-950 text-white"
                      : "hover:bg-slate-100"
                  }`}
                >
                  <span className="block text-xs font-bold">
                    {edition.seasonName} · {edition.issueLabel}
                  </span>
                  <span
                    className={`mt-1 block truncate text-xs ${
                      edition.id === editionId
                        ? "text-slate-300"
                        : "text-slate-500"
                    }`}
                  >
                    {edition.generationMode.replaceAll("_", " ")} ·{" "}
                    {edition.status}
                    {edition.isHomeActive ? " · home active" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-3 text-sm text-slate-500">
              Generate a completed week to open the Newsroom.
            </p>
          )}
        </aside>

        {selectedEdition && manualContent ? (
          <div className="min-w-0 space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void copyPrompt()}
                disabled={!newsroom.prompt}
              >
                <Clipboard />
                Copy ChatGPT prompt
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void toggleVisibility()}
                disabled={newsroom.setVisibility.isPending}
              >
                {selectedEdition.status === "published" ? <EyeOff /> : <Eye />}
                {selectedEdition.status === "published" ? "Hide" : "Restore"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void toggleHomeActive()}
                disabled={
                  selectedEdition.status !== "published" ||
                  newsroom.setHomeActive.isPending
                }
              >
                <House />
                {selectedEdition.isHomeActive
                  ? "Remove from Home"
                  : "Make active on Home"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void clearHomeActive()}
                disabled={newsroom.setHomeActive.isPending}
              >
                <EyeOff />
                No newsletter on Home
              </Button>
              <span className="self-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {selectedEdition.generationMode.replaceAll("_", " ")}
              </span>
            </div>

            <details
              open
              className="rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <summary className="cursor-pointer px-5 py-4 font-semibold text-slate-900">
                Article visibility ({activeArticleCount} of{" "}
                {selectedEdition.content.sections.length} active)
              </summary>
              <div className="divide-y border-t border-slate-200">
                {selectedEdition.content.sections.map((section) => {
                  const isActive =
                    !selectedEdition.inactiveSectionIds?.includes(section.id);
                  return (
                    <div
                      key={section.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {section.headline}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
                          {section.eyebrow}
                          {section.author ? ` · ${section.author.name}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        disabled={newsroom.setSectionActive.isPending}
                        onClick={() =>
                          void toggleSectionActive(section.id, isActive)
                        }
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isActive ? (
                          <ToggleRight className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isActive ? "Active" : "Off"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>

            <details
              open
              className="rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <summary className="cursor-pointer px-5 py-4 font-semibold text-slate-900">
                Import a ChatGPT rewrite
              </summary>
              <div className="border-t border-slate-200 p-5">
                <label className="block text-sm font-medium text-slate-700">
                  Paste ChatGPT response
                  <textarea
                    value={rawImport}
                    rows={12}
                    spellCheck={false}
                    placeholder='{"headline":"…","deck":"…","sections":[…]}'
                    onChange={(event) => {
                      setRawImport(event.target.value);
                      setImportResult(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!rawImport.trim()}
                    onClick={validateImport}
                  >
                    <Eye />
                    Validate and preview
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      !importResult?.valid || newsroom.publishImport.isPending
                    }
                    onClick={() => void publishImport()}
                  >
                    <Sparkles />
                    Publish replacement
                  </Button>
                </div>
                {importResult ? (
                  importResult.valid ? (
                    <p
                      role="status"
                      className="mt-3 text-sm font-medium text-emerald-700"
                    >
                      JSON structure and verified links passed validation.
                      Review the preview below before publishing.
                    </p>
                  ) : (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-700">
                      {importResult.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </details>

            {importResult?.valid && importResult.content ? (
              <WeeklyEditionArticle
                edition={{
                  ...selectedEdition,
                  content: importResult.content,
                }}
                preview
              />
            ) : null}

            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-5 py-4 font-semibold text-slate-900">
                Edit wording manually
              </summary>
              <div className="border-t border-slate-200 p-5">
                <WeeklyEditionEditor
                  content={manualContent}
                  disabled={newsroom.updateManual.isPending}
                  onChange={setManualContent}
                />
                {manualErrors.length > 0 ? (
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-700">
                    {manualErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  type="button"
                  className="mt-4"
                  disabled={newsroom.updateManual.isPending}
                  onClick={() => void saveManual()}
                >
                  <Save />
                  Validate and publish manual edit
                </Button>
              </div>
            </details>

            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-5 py-4 font-semibold text-slate-900">
                Revision history ({newsroom.revisions?.length ?? 0})
              </summary>
              <div className="divide-y border-t border-slate-200">
                {newsroom.revisions?.length ? (
                  newsroom.revisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {revision.generationMode.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(revision.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={newsroom.restoreRevision.isPending}
                        onClick={() =>
                          newsroom.restoreRevision.mutate(
                            { revisionId: revision.id },
                            {
                              onSuccess: () =>
                                showNotice("Earlier revision restored."),
                            },
                          )
                        }
                      >
                        <FileClock />
                        Restore revision
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="px-5 py-6 text-sm text-slate-500">
                    Revisions appear after the first replacement or manual edit.
                  </p>
                )}
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
