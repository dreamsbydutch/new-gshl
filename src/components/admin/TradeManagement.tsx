"use client";
import { useTradeManagement } from "@gshl-hooks/features/useTradeManagement";
import { Button, Input, Select } from "@gshl-ui";
import { AdminPanelSkeleton } from "@gshl-skeletons";
import { formatMoney } from "@gshl-utils";

export function TradeManagement() {
  const vm = useTradeManagement();
  if (vm.loading) return <AdminPanelSkeleton />;
  if (!vm.season)
    return (
      <p className="text-sm text-slate-500">No active season is configured.</p>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-oswald text-2xl">Record trade</h2>
        <span className="text-sm text-slate-500">{vm.season.name}</span>
      </div>
      {vm.message ? (
        <p role="status" className="text-sm text-emerald-700">
          {vm.message}
        </p>
      ) : null}
      {vm.error ? (
        <p role="alert" className="text-sm text-red-700">
          {vm.error}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          vm.startReview();
        }}
        className="space-y-4"
      >
        <fieldset
          disabled={vm.pending || Boolean(vm.review)}
          className="space-y-4 disabled:opacity-70"
        >
          <label className="grid max-w-xs gap-1 text-sm">
            Trade date
            <Input
              type="date"
              value={vm.effectiveDate}
              onChange={(event) => vm.setEffectiveDate(event.target.value)}
              required
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            {vm.sides.map((side) => (
              <section
                key={side.side}
                aria-label={`Team ${side.side} sends`}
                className="space-y-3 rounded-lg border border-slate-200 p-4"
              >
                <label className="grid gap-1 text-sm">
                  Team {side.side} sends
                  <Select
                    value={side.teamId}
                    onChange={(event) =>
                      vm.chooseTeam(side.side, event.target.value)
                    }
                    required
                  >
                    <option value="">Choose team</option>
                    {vm.teams.map((team) => (
                      <option
                        key={team.id}
                        value={team.id}
                        disabled={vm.sides.some(
                          (other) =>
                            other.side !== side.side &&
                            other.teamId === team.id,
                        )}
                      >
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {vm.catalogLoading ? (
                  <p role="status" className="text-sm text-slate-500">
                    Loading assets…
                  </p>
                ) : null}
                <fieldset className="space-y-1">
                  <legend className="mb-1 text-xs font-semibold uppercase text-slate-500">
                    Players
                  </legend>
                  <div className="max-h-64 overflow-y-auto">
                    {side.players.map((player) => (
                      <label
                        key={player.id}
                        className="flex min-h-10 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={side.selectedPlayers.includes(player.id)}
                          disabled={player.disabled}
                          onChange={() =>
                            vm.toggle(side.side, "player", player.id)
                          }
                          className="h-4 w-4"
                        />
                        <span>{player.name}</span>
                        {player.alreadyMoved ? (
                          <span className="ml-auto text-xs text-slate-400">
                            On receiver
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-1">
                  <legend className="mb-1 text-xs font-semibold uppercase text-slate-500">
                    Draft picks
                  </legend>
                  <div className="max-h-52 overflow-y-auto">
                    {side.picks.map((pick) => (
                      <label
                        key={pick.id}
                        className="flex min-h-10 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={side.selectedPicks.includes(pick.id)}
                          onChange={() => vm.toggle(side.side, "pick", pick.id)}
                          className="h-4 w-4"
                        />
                        {pick.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </section>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            Notes (public)
            <Input
              value={vm.notes}
              maxLength={1000}
              onChange={(event) => vm.setNotes(event.target.value)}
            />
          </label>
        </fieldset>
        {!vm.review ? (
          <Button type="submit" disabled={vm.pending || vm.catalogLoading}>
            Review trade
          </Button>
        ) : null}
      </form>
      {vm.review ? (
        <section
          aria-label="Review trade"
          className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4"
        >
          <h3 className="font-semibold">Review trade</h3>
          {!vm.preview && !vm.previewError ? (
            <p role="status" className="text-sm">
              Checking contracts, cap space and picks…
            </p>
          ) : null}
          {vm.previewError ? (
            <p role="alert" className="text-sm text-red-700">
              {vm.previewError}
            </p>
          ) : null}
          {vm.preview ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {vm.sides.map((side) => (
                  <div key={side.side}>
                    <h4 className="mb-2 font-semibold">
                      {side.side === "A"
                        ? vm.preview!.teamAName
                        : vm.preview!.teamBName}{" "}
                      sends
                    </h4>
                    <ul className="space-y-2 text-sm">
                      {vm
                        .preview!.players.filter(
                          (player) => player.fromTeamId === side.teamId,
                        )
                        .map((player) => (
                          <li key={player.playerId}>
                            <span className="font-semibold">
                              {player.playerName}
                            </span>
                            {player.contracts.map((contract, index) => (
                              <p key={index} className="text-xs text-slate-600">
                                {formatMoney(contract.salary)} · through{" "}
                                {contract.expires} · {contract.status}
                              </p>
                            ))}
                          </li>
                        ))}
                      {vm
                        .preview!.picks.filter(
                          (pick) => pick.fromTeamId === side.teamId,
                        )
                        .map((pick) => (
                          <li key={pick.pickId}>{pick.label}</li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              {vm.preview.reservations.length ? (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Keeper picks</h4>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {vm.preview.reservations.map((reservation) => (
                      <li key={reservation.pickId}>
                        {reservation.teamName} · {reservation.seasonName} ·{" "}
                        {reservation.pickLabel} · {reservation.playerName}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                {vm.preview.caps.map((cap) => (
                  <p key={`${cap.teamName}:${cap.seasonName}`}>
                    {cap.teamName} · {cap.seasonName}:{" "}
                    {formatMoney(cap.committed)} / $25m
                  </p>
                ))}
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void vm.confirm()}
              disabled={vm.pending || !vm.preview}
            >
              {vm.pending ? "Recording…" : "Record trade"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={vm.cancelReview}
              disabled={vm.pending}
            >
              Back
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
