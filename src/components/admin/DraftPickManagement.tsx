"use client";

import { useEffect, useRef } from "react";
import { Button, TableViewport } from "@gshl-ui";
import { AdminPanelSkeleton } from "@gshl-skeletons";
import { useDraftPickManagement } from "@gshl-hooks/features/useDraftPickManagement";

const control =
  "h-9 rounded border bg-background px-2 text-sm focus-visible:outline focus-visible:outline-2";

export function DraftPickManagement() {
  const vm = useDraftPickManagement();
  const form = vm.form;
  const editorRef = useRef<HTMLElement>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const editingId = vm.editing?.id;
  useEffect(() => {
    if (editingId) editorRef.current?.focus();
    else editButtonRef.current?.focus();
  }, [editingId]);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Draft picks</h2>
        <p className="text-sm text-muted-foreground">
          Correct draft records before or after a draft. Player ownership,
          lineups, and contracts are unchanged.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm">
          Season
          <select
            className={control}
            value={vm.seasonId}
            disabled={Boolean(form) || vm.staged.length > 0}
            onChange={(e) => vm.selectSeason(e.target.value)}
          >
            {vm.seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Team
          <select
            className={control}
            value={vm.teamId}
            onChange={(e) => vm.setTeamId(e.target.value)}
          >
            <option value="">All teams</option>
            {vm.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Search picks
          <input
            className={control}
            value={vm.search}
            onChange={(e) => vm.setSearch(e.target.value)}
            placeholder="Player, team, or round-pick"
          />
        </label>
      </div>
      {vm.message && (
        <p role="status" className="text-sm">
          {vm.message}
        </p>
      )}
      {form && vm.editing && (
        <section
          aria-label="Correct draft pick"
          ref={editorRef}
          tabIndex={-1}
          className="space-y-3 border-y py-4"
        >
          <h3 className="font-semibold">
            Correct round {vm.editing.round}, pick {vm.editing.pick}
          </h3>
          <fieldset
            disabled={vm.isPending || vm.reviewing}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="grid gap-1 text-sm">
              Assigned team
              <select
                className={control}
                value={form.gshlTeamId ?? ""}
                onChange={(e) =>
                  vm.setForm({ ...form, gshlTeamId: e.target.value || null })
                }
              >
                <option value="">Choose team</option>
                {form.gshlTeamId &&
                  !vm.teams.some((team) => team.id === form.gshlTeamId) && (
                    <option value={form.gshlTeamId}>
                      {vm.teamName(form.gshlTeamId)}
                    </option>
                  )}
                {vm.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Original team
              <select
                className={control}
                value={form.originalTeamId ?? ""}
                onChange={(e) =>
                  vm.setForm({
                    ...form,
                    originalTeamId: e.target.value || null,
                  })
                }
              >
                <option value="">Unknown</option>
                {form.originalTeamId &&
                  !vm.teams.some((team) => team.id === form.originalTeamId) && (
                    <option value={form.originalTeamId}>
                      {vm.teamName(form.originalTeamId)}
                    </option>
                  )}
                {vm.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Selected player
              <select
                className={control}
                disabled={vm.playersLoading}
                value={form.playerId ?? ""}
                onChange={(e) =>
                  vm.setForm({ ...form, playerId: e.target.value || null })
                }
              >
                <option value="">No player</option>
                {form.playerId &&
                  !vm.players.some((player) => player.id === form.playerId) && (
                    <option value={form.playerId}>
                      {form.playerName ?? "Missing player"}
                    </option>
                  )}
                {[...vm.players]
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Round
              <input
                className={control}
                type="number"
                min="1"
                step="1"
                value={form.round}
                onChange={(e) => vm.setForm({ ...form, round: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Pick number
              <input
                className={control}
                type="number"
                min="1"
                step="1"
                value={form.pick}
                onChange={(e) => vm.setForm({ ...form, pick: e.target.value })}
              />
            </label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isTraded}
                  onChange={(e) =>
                    vm.setForm({ ...form, isTraded: e.target.checked })
                  }
                />
                Traded
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isSigning}
                  onChange={(e) =>
                    vm.setForm({ ...form, isSigning: e.target.checked })
                  }
                />
                Signing
              </label>
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Stage all matching changes before saving. Corrections update draft
            records only; player ownership, rosters, and contracts stay
            unchanged.
          </p>
          <div className="flex gap-2">
            <Button disabled={!form.gshlTeamId} onClick={vm.stage}>
              Stage correction
            </Button>
            <Button variant="outline" onClick={vm.cancel}>
              Cancel edit
            </Button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer">
              Correction history (latest 20)
            </summary>
            {vm.history === undefined ? (
              <p>Loading history…</p>
            ) : vm.history.length === 0 ? (
              <p>No corrections recorded.</p>
            ) : (
              vm.history.map((entry) => (
                <div key={entry._id} className="space-y-1 border-t py-2">
                  <p>
                    {new Date(entry.createdAt).toLocaleString()} —{" "}
                    {entry.reason}
                  </p>
                </div>
              ))
            )}
          </details>
        </section>
      )}
      {vm.error && (
        <p role="alert" className="text-sm text-destructive">
          {vm.error}
        </p>
      )}
      {vm.staged.length > 0 && (
        <section
          aria-label="Staged corrections"
          className="space-y-3 border-y py-3"
        >
          <h3 className="font-semibold">
            {vm.staged.length} staged corrections
          </h3>
          <p className="text-sm">
            Review both sides of each swap. Nothing is saved until you save this
            batch. Staged changes are lost if you leave this page.
          </p>
          <TableViewport ariaLabel="Correction comparison">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Before</th>
                  <th className="p-2">After</th>
                </tr>
              </thead>
              <tbody>
                {vm.staged.map(({ before, after }) => (
                  <tr key={before.id} className="border-t">
                    {[before, after].map((pick, index) => (
                      <td key={index} className="p-2">
                        <p>
                          Round {pick.round}, pick {pick.pick}:{" "}
                          {vm.teamName(pick.gshlTeamId)} —{" "}
                          {pick.playerName ?? "No player"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Original: {vm.teamName(pick.originalTeamId)}; traded:{" "}
                          {pick.isTraded ? "yes" : "no"}; signing:{" "}
                          {pick.isSigning ? "yes" : "no"}
                        </p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
          <label className="grid gap-1 text-sm">
            Reason for corrections
            <input
              className={control}
              maxLength={1000}
              value={vm.reason}
              disabled={vm.isPending || vm.reviewing}
              onChange={(e) => vm.setReason(e.target.value)}
            />
          </label>
          {vm.reviewing && (
            <p className="text-sm">
              Save all {vm.staged.length} corrections together? Draft records
              will change; player ownership, current rosters, and contracts will
              be preserved.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {vm.reviewing ? (
              <>
                <Button disabled={vm.isPending} onClick={() => void vm.save()}>
                  {vm.isPending ? "Saving…" : "Save all corrections"}
                </Button>
                <Button
                  variant="outline"
                  disabled={vm.isPending}
                  onClick={() => vm.setReviewing(false)}
                >
                  Back to editing
                </Button>
              </>
            ) : (
              <Button
                disabled={Boolean(form) || !vm.reason.trim()}
                onClick={() => vm.setReviewing(true)}
              >
                Review batch
              </Button>
            )}
            <Button
              variant="outline"
              disabled={vm.isPending}
              onClick={vm.discard}
            >
              Discard batch
            </Button>
          </div>
        </section>
      )}
      {vm.isLoading ? (
        <AdminPanelSkeleton />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {vm.picks.length} of {vm.total} picks
          </p>
          <TableViewport ariaLabel="Draft picks">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b">
                <tr>
                  {[
                    "Round",
                    "Pick",
                    "Assigned team",
                    "Original team",
                    "Player",
                    "Traded",
                    "Signing",
                    "Action",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2" scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vm.picks.map((pick) => (
                  <tr key={pick.id} className="border-b">
                    <td className="px-2 py-2">{pick.round}</td>
                    <td className="px-2 py-2">{pick.pick}</td>
                    <td className="px-2 py-2">
                      {vm.teamName(pick.gshlTeamId)}
                    </td>
                    <td className="px-2 py-2">
                      {vm.teamName(pick.originalTeamId)}
                    </td>
                    <td className="px-2 py-2">{pick.playerName ?? "—"}</td>
                    <td className="px-2 py-2">
                      {pick.isTraded ? "Yes" : "No"}
                    </td>
                    <td className="px-2 py-2">
                      {pick.isSigning ? "Yes" : "No"}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(form) || vm.reviewing || vm.isPending}
                        onClick={(event) => {
                          editButtonRef.current = event.currentTarget;
                          vm.edit(pick);
                        }}
                        aria-label={`Edit round ${pick.round}, pick ${pick.pick}`}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
          {!vm.picks.length && (
            <p className="text-sm">No draft picks match this selection.</p>
          )}
        </>
      )}
    </section>
  );
}
