"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  useContracts,
  useCreateContract,
  usePlayers,
  useSeasons,
  useTeams,
} from "@gshl-hooks";
import { Button, Select } from "@gshl-ui";
import {
  deriveContractCreationTerms,
  formatMoney,
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
  const signablePlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return playersQuery.data
      .filter((player) => {
        const belongsToTeam =
          String(player.gshlTeamId) === String(selectedTeam.franchiseId);
        const isLeagueUfa =
          freeAgencyOpen &&
          String(player.isResignable).toUpperCase() ===
            String(ResignableStatus.UFA);
        return (
          player.isActive &&
          player.isSignable &&
          Boolean(player.isResignable) &&
          (belongsToTeam || isLeagueUfa) &&
          !playerHasSigningSeasonContract.has(String(player.id))
        );
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [
    freeAgencyOpen,
    playerHasSigningSeasonContract,
    playersQuery.data,
    selectedTeam,
  ]);
  const selectedPlayer = signablePlayers.find(
    (player) => String(player.id) === playerId,
  );

  const preview = useMemo(() => {
    if (!selectedPlayer || !signingSeason) return null;
    try {
      return deriveContractCreationTerms({
        player: selectedPlayer,
        signingSeason,
        contractLength,
        contracts: contractsQuery.data,
        seasons: seasonsQuery.data,
      });
    } catch {
      return null;
    }
  }, [
    contractLength,
    contractsQuery.data,
    seasonsQuery.data,
    selectedPlayer,
    signingSeason,
  ]);

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
            UFA free agency is open. Any signable UFA can sign with any team at
            the 125% premium.
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

          <label className="space-y-1 text-sm font-medium">
            <span>Signable player</span>
            <Select
              value={playerId}
              disabled={!selectedTeam || isLoading}
              onValueChange={(value) => {
                setPlayerId(value);
                setSuccess("");
              }}
            >
              <option value="">
                {selectedTeam && !isLoading && signablePlayers.length === 0
                  ? "No signable players"
                  : "Select player"}
              </option>
              {signablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.fullName} ({player.isResignable}
                  {freeAgencyOpen &&
                  String(player.gshlTeamId) !==
                    String(selectedTeam?.franchiseId)
                    ? " · league-wide"
                    : ""}
                  )
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1 text-sm font-medium">
            <span>Years</span>
            <Select
              value={String(contractLength)}
              onValueChange={(value) =>
                setContractLength(Number(value) as ContractLength)
              }
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
