"use client";

import type { WeeklyEditionEditorProps } from "@gshl-types";

export function WeeklyEditionEditor({
  content,
  disabled = false,
  onChange,
}: WeeklyEditionEditorProps) {
  const updateSection = (
    sectionId: string,
    field: "eyebrow" | "headline" | "body",
    value: string,
  ) => {
    onChange({
      ...content,
      sections: content.sections.map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section,
      ),
    });
  };

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-slate-800">
        Lead headline
        <input
          value={content.headline}
          disabled={disabled}
          maxLength={90}
          onChange={(event) =>
            onChange({ ...content, headline: event.target.value })
          }
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Deck
        <textarea
          value={content.deck}
          disabled={disabled}
          maxLength={220}
          rows={3}
          onChange={(event) =>
            onChange({ ...content, deck: event.target.value })
          }
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      {content.sections.map((section) => (
        <fieldset
          key={section.id}
          disabled={disabled}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            {section.kind.replaceAll("_", " ")}
          </legend>
          <div className="grid gap-3">
            {section.author ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                By {section.author.name} · {section.author.position}
              </p>
            ) : null}
            <label className="text-xs font-medium text-slate-700">
              Eyebrow
              <input
                value={section.eyebrow}
                maxLength={50}
                onChange={(event) =>
                  updateSection(section.id, "eyebrow", event.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Headline
              <input
                value={section.headline}
                maxLength={90}
                onChange={(event) =>
                  updateSection(section.id, "headline", event.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Story
              <textarea
                value={section.body}
                maxLength={1000}
                rows={5}
                onChange={(event) =>
                  updateSection(section.id, "body", event.target.value)
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm leading-6"
              />
            </label>
          </div>
        </fieldset>
      ))}
    </div>
  );
}
