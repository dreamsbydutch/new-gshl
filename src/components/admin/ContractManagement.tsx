"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  useContracts,
  useCreateContract,
  usePlayers,
  useSeasons,
  useTeams,
} from "@gshl-hooks";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
} from "@gshl-ui";
import {
  checkContractCapSpace,
  deriveContractCreationTerms,
  formatMoney,
  isUnsignedForSigningSeason,
  isUfaFreeAgencyOpen,
} from "@gshl-utils";
import {
  ResignableStatus,
  type ContractLength,
  type GSHLTeam,
} from "@gshl-types";

const LENGTHS: readonly ContractLength[] = [1, 2, 3];

export function ContractManagement() {
  const [teamId, setTeamId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [contractLength, setContractLength] = useState<ContractLength>(1);
  const [success, setSuccess] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);

  const seasonsQuery = useSeasons();
  const signingSeason = seasonsQuery.data.find((season) => season.isActive);
  const freeAgencyOpen = isUfaFreeAgencyOpen(signingSeason);
  const teamsQuery = useTeams({
    seasonId: signingSeason?.id,
    enabled: Boolean(signingSeason),
  });
  const playersQuery = usePlayers();
  const contractsQuery = useContracts();
  const createContract = useCreateContract();

  const teams = useMemo(
    () =>
      (teamsQuery.data as GSHLTeam[])
        .filter((team) => team.isActive)
        .sort((left, right) =>
          String(left.name ?? left.abbr ?? "").localeCompare(
            String(right.name ?? right.abbr ?? ""),
          ),
        ),
    [teamsQuery.data],
  );
  const selectedTeam = teams.find((team) => String(team.id) === teamId);
  const playerHasSigningSeasonContract = useMemo(
    () =>
      new Set(
        contractsQuery.data
          .filter(
            (contract) =>
              String(contract.seasonId) === String(signingSeason?.id ?? ""),
          )
          .map((contract) => String(contract.playerId)),
      ),
    [contractsQuery.data, signingSeason?.id],
  );
  const signablePlayerOptions = useMemo(() => {
    if (!selectedTeam?.ownerId || !signingSeason) return [];
    const ownerId = selectedTeam.ownerId;
    return playersQuery.data
      .flatMap((player) => {
        const belongsToTeam =
          String(player.gshlTeamId) === String(selectedTeam.franchiseId);
        const isLeagueUfa =
          freeAgencyOpen &&
          isUnsignedForSigningSeason(
            String(player.id),
            String(signingSeason.id),
            contractsQuery.data,
            seasonsQuery.data,
          );
        const eligible =
          player.isActive &&
          ((player.isSignable &&
            Boolean(player.isResignable) &&
            belongsToTeam) ||
            isLeagueUfa) &&
          !playerHasSigningSeasonContract.has(String(player.id));
        if (!eligible) return [];

        try {
          const terms = deriveContractCreationTerms({
            player: freeAgencyOpen
              ? { ...player, isResignable: ResignableStatus.UFA }
              : player,
            signingSeason,
            contractLength,
            contracts: contractsQuery.data,
            seasons: seasonsQuery.data,
          });
          const capCheck = checkContractCapSpace({
            ownerId,
            signingSeasonId: String(signingSeason.id),
            contractLength,
            contractSalary: terms.contractSalary,
            contracts: contractsQuery.data,
            seasons: seasonsQuery.data,
          });
          return capCheck.affordable ? [{ player, terms }] : [];
        } catch {
          return [];
        }
      })
      .sort((left, right) =>
        left.player.fullName.localeCompare(right.player.fullName),
      );
  }, [
    contractLength,
    contractsQuery.data,
    freeAgencyOpen,
    playerHasSigningSeasonContract,
    playersQuery.data,
    seasonsQuery.data,
    selectedTeam,
    signingSeason,
  ]);
  const selectedPlayerOption = signablePlayerOptions.find(
    ({ player }) => String(player.id) === playerId,
  );
  const selectedPlayer = selectedPlayerOption?.player;
  const preview = selectedPlayerOption?.terms ?? null;
  const filteredPlayerOptions = useMemo(() => {
    const search = playerSearch.trim().toLocaleLowerCase();
    if (!search) return signablePlayerOptions;
    return signablePlayerOptions.filter(({ player }) =>
      [
        player.fullName,
        player.nhlTeam,
        player.posGroup,
        ...(player.nhlPos ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
    );
  }, [playerSearch, signablePlayerOptions]);

  const isLoading =
    seasonsQuery.isLoading ||
    teamsQuery.isLoading ||
    playersQuery.isLoading ||
    contractsQuery.isLoading;
  const canSubmit = Boolean(teamId && playerId && preview && !isLoading);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !selectedPlayer) return;
    setSuccess("");
    createContract.mutate(
      { teamId, playerId, contractLength },
      {
        onSuccess: () => {
          setSuccess(`${selectedPlayer.fullName}'s contract was created.`);
          setPlayerId("");
          setPlayerSearch("");
        },
      },
    );
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Create Contract</h1>
        <p className="text-sm text-muted-foreground">
          Contracts signed in {signingSeason?.name ?? "the active season"} begin
          next season. Salary, dates, type, and expiry status are calculated
          automatically.
        </p>
        {freeAgencyOpen ? (
          <p className="mt-2 text-sm font-medium text-green-700">
            UFA free agency is open. Any active player without a current or
            continuing contract can sign with any team at the 125% premium.
          </p>
        ) : null}
      </div>

      <form className="space-y-5 rounded-lg border p-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            <span>Team</span>
            <Select
              value={teamId}
              disabled={isLoading || !signingSeason}
              onValueChange={(value) => {
                setTeamId(value);
                setPlayerId("");
                setPlayerSearch("");
                setSuccess("");
              }}
            >
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name ?? team.abbr ?? team.id}
                </option>
              ))}
            </Select>
          </label>

          <div className="space-y-1 text-sm font-medium">
            <span>Signable player</span>
            <Popover open={playerPickerOpen} onOpenChange={setPlayerPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start truncate font-normal"
                  disabled={!selectedTeam || isLoading}
                  aria-label="Search and select a signable player"
                >
                  {selectedPlayer?.fullName ??
                    (selectedTeam &&
                    !isLoading &&
                    signablePlayerOptions.length === 0
                      ? "No affordable signable players"
                      : "Search players…")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <Input
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search by name, NHL team, or position"
                  aria-label="Search signable players"
                  autoFocus
                />
                <div
                  className="mt-2 max-h-72 space-y-1 overflow-y-auto"
                  role="listbox"
                  aria-label="Affordable signable players"
                >
                  {filteredPlayerOptions.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      No matching affordable players.
                    </p>
                  ) : (
                    filteredPlayerOptions.map(({ player, terms }) => (
                      <button
                        key={player.id}
                        type="button"
                        role="option"
                        aria-selected={String(player.id) === playerId}
                        className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => {
                          setPlayerId(String(player.id));
                          setPlayerSearch("");
                          setPlayerPickerOpen(false);
                          setSuccess("");
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {player.fullName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {player.nhlTeam} · {player.posGroup}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatMoney(terms.contractSalary)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {selectedTeam && !isLoading ? (
              <span className="block text-xs font-normal text-muted-foreground">
                Only players affordable for the selected term are shown.
              </span>
            ) : null}
          </div>

          <label className="space-y-1 text-sm font-medium">
            <span>Years</span>
            <Select
              value={String(contractLength)}
              onValueChange={(value) => {
                setContractLength(Number(value) as ContractLength);
                setPlayerId("");
                setPlayerSearch("");
                setSuccess("");
              }}
            >
              {LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {length}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {preview ? (
          <div className="rounded-md bg-muted p-4 text-sm">
            <h2 className="mb-3 font-semibold">Contract preview</h2>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <PreviewItem
                label="Salary"
                value={formatMoney(preview.contractSalary)}
              />
              <PreviewItem label="Type" value={preview.contractType} />
              <PreviewItem
                label="Starts"
                value={`${preview.startSeason.name} · ${preview.startDate}`}
              />
              <PreviewItem
                label="Expires"
                value={`${preview.expirySeason.name} · ${preview.expiryDate}`}
              />
              <PreviewItem
                label="Signing status"
                value={preview.signingStatus}
              />
              <PreviewItem label="Expiry status" value={preview.expiryStatus} />
            </dl>
          </div>
        ) : null}

        {createContract.error ? (
          <p className="text-sm text-red-600">{createContract.error.message}</p>
        ) : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        <Button type="submit" disabled={!canSubmit || createContract.isPending}>
          {createContract.isPending ? "Creating…" : "Create contract"}
        </Button>
      </form>
    </section>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
