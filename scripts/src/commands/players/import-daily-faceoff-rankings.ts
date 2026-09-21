/**
 * Imports Matt Larkin's Daily Faceoff 2026-27 preseason player ranks into
 * Player.dailyFaceoffRk (shown in the draft board as "DF Rk").
 *
 * Usage:
 *   npm.cmd --prefix scripts run players:import-daily-faceoff-rankings -- --target production
 *   npm.cmd --prefix scripts run players:import-daily-faceoff-rankings -- --target production --apply
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import {
  configureConvexTarget,
  fetchModel,
  updateById,
} from "@gshl-lib/data/convex-store";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

type PlayerRow = Record<string, unknown> & {
  id: string;
  fullName?: string;
  dailyFaceoffRk?: number | null;
  overallRating?: number | null;
  overallRk?: number | null;
  nhlPos?: string[] | null;
  nhlTeam?: string[] | null;
};

const ARTICLE_URL =
  "https://www.dailyfaceoff.com/news/matt-larkin-fantasy-hockey-top-300-nhl-player-rankings-2026-27-list-draft-pool";

// Top 300, in Daily Faceoff order, as published Sept. 17, 2026. The source's
// at-a-glance table has a duplicated 32; Logan Thompson is rank 33 in the
// article body, which preserves the published 1-300 sequence.
const TOP_300 = `Nathan MacKinnon
Connor McDavid
Macklin Celebrini
Nikita Kucherov
Leon Draisaitl
David Pastrnak
Cale Makar
Kirill Kaprizov
Evan Bouchard
Martin Necas
Zach Werenski
Mikko Rantanen
Andrei Vasilevskiy
Jason Robertson
Lane Hutson
Quinn Hughes
Nick Suzuki
Kyle Connor
Cole Caufield
Wyatt Johnston
Cutter Gauthier
Brady Tkachuk
Matt Boldy
Rasmus Dahlin
Tage Thompson
Jack Eichel
William Nylander
Auston Matthews
Mitch Marner
Jack Hughes
Matthew Tkachuk
Matthew Schaefer
Logan Thompson
Connor Hellebuyck
Leo Carlsson
Tim Stutzle
Jake Guentzel
Ilya Sorokin
Mark Scheifele
Brandon Hagel
Adrian Kempe
Jake Oettinger
Igor Shesterkin
Artemi Panarin
Clayton Keller
Moritz Seider
Adam Fox
Dylan Guenther
Sam Reinhart
Alex DeBrincat
Sebastian Aho
Sidney Crosby
Jeremy Swayman
Jackson LaCombe
Logan Cooley
Filip Forsberg
Lucas Raymond
Jesper Wallstedt
Ivan Demidov
Juraj Slafkovsky
John Carlson
Jakob Chychrun
Miro Heiskanen
Beckett Sennecke
Connor Bedard
Darren Raddysh
Andrei Svechnikov
Jesper Bratt
Will Smith
Kirill Marchenko
Morgan Geekie
Aleksander Barkov
Drake Batherson
Alex Tuch
Lukas Dostal
Dylan Larkin
Brayden Point
Zach Hyman
Matthew Knies
Scott Wedgewood
Josh Morrissey
Dylan Holloway
Jake Sanderson
Jakub Dobes
Roman Josi
Robert Thomas
Travis Konecny
Tom Wilson
Nico Hischier
Steven Stamkos
John Tavares
Alex Ovechkin
Adam Fantilli
Nikolaj Ehlers
Mark Stone
Porter Martone
Karel Vejmelka
Bo Horvat
Brock Nelson
Jacob Markstrom
Pavel Dorofeyev
Jet Greaves
Jordan Kyrou
Mika Zibanejad
Quinton Byfield
Roope Hintz
Gavin McKenna
Brandt Clarke
JJ Peterka
Mikhail Sergachev
Erik Karlsson
Brad Marchand
Linus Ullmark
Seth Jarvis
Vincent Trocheck
Owen Tippett
Charlie McAvoy
Nick Schmaltz
Timo Meier
Shayne Gostisbehere
Jackson Blake
Bowen Byram
Egor Chinakhov
Alexis Lafreniere
Trevor Zegras
Dan Vladar
Gabe Vilardi
Brock Faber
Jimmy Snuggerud
Mathew Barzal
Shea Theodore
Bryan Rust
Dylan Cozens
William Eklund
J.T. Miller
Dylan Strome
Matvei Michkov
Ryan O'Reilly
Thomas Harley
Zach Benson
Valeri Nichushkin
Anton Frondell
Josh Doan
Logan Stankoven
Sam Bennett
Artturi Lehkonen
Nazem Kadri
Aliaksei Protas
Joel Eriksson Ek
Kevin Fiala
Noah Dobson
Mason McTavish
Jared McCann
Carter Hart
Ivan Barbashev
Tomas Hertl
Ryan Leonard
Rickard Rakell
Elias Pettersson
Carter Verhaeghe
Ukko-Pekka Luukkonen
Brandon Bussi
Matt Duchene
Jake Allen
Pavel Zacha
Rasmus Andersson
Frederik Andersen
John Gibson
Bobby McMann
Josh Norris
Ivar Stenberg
Spencer Knight
Matt Savoie
Dustin Wolf
Mackenzie Blackwood
Mavrik Bourque
Tyson Foerster
Tyler Bertuzzi
Vince Dunn
Frank Nazar
Mason Marchment
Anton Forsberg
Dougie Hamilton
Cole Hutson
Luke Hughes
Sergei Bobrovsky
Joel Hofer
Ryan Nugent-Hopkins
Victor Hedman
Patrick Kane
Evgeni Malkin
Connor McMichael
Mats Zuccarello
Anton Lundell
Juuse Saros
Shane Pinto
Gabriel Landeskog
Pierre-Luc Dubois
Anders Lee
Will Cuylle
Luke Evangelista
Anthony Cirelli
Konsta Helenius
Matt Coronato
Brock Boeser
Viktor Arvidsson
Matvei Gridin
Pyotr Kochetkov
Jake DeBrusk
Filip Hronek
Chris Kreider
Pavel Buchnevich
Jack Quinn
Simon Nemec
Olen Zellweger
Roman Kantserov
Sergei Murashov
Gabe Perreault
Michael Misa
Mackie Samoskevich
Anthony Mantha
Alexander Nikishin
Yaroslav Askarov
Lawson Crouse
Seth Jones
Troy Terry
Joey Daccord
Matty Beniers
Jacob Fowler
Boone Jenner
Ilya Protas
Igor Chernyshov
Jordan Eberle
Collin Graf
Christian Dvorak
Marco Rossi
Ryan McLeod
Claude Giroux
Filip Gustavsson
Mattias Samuelsson
MacKenzie Weegar
Alex Laferriere
Zeev Buium
Sebastian Cossa
Philip Broberg
Emil Heineman
Elias Lindholm
Thomas Chabot
Jake Neighbours
Ike Howard
Matthew Wood
Zayne Parekh
Andrei Kuzmenko
Danila Yurov
Charlie Coyle
Nick Lardis
Joseph Woll
Dawson Mercer
Maxim Shabanov
Mikael Granlund
Jacob Trouba
Jaden Schwartz
Tyler Toffoli
Akira Schmid
Jamie Drysdale
Brandon Montour
Alexander Wennberg
Mattias Ekholm
Darcy Kuemper
Travis Sanheim
Blake Coleman
Yakov Trenin
Arturs Silovs
Mike Matheson
Tyler Seguin
Sam Malinski
Ryan Hartman
Oliver Kapanen
Alex Lyon
Viggo Björck
Luca Cagnoni
Taylor Hall
Jack Roslovic
Denton Mateychuk
Vasily Podkolzin
Fraser Minten
Devon Toews
Noah Cates
Sean Monahan
James Hagens
Artyom Levshunov
Tij Iginla
Easton Cowan
Erik Haula
Justin Hryckowian
Brett Howden
Bradly Nadeau
Simon Edvinsson
Jason Zucker
Vladimir Tarasenko`.split("\n");

// Daily Faceoff does not numerically rank these names. The importer orders the
// matched GSHL players by our stored overall rating, not this source order.
const ON_THE_BUBBLE = `Casey DeSmith
Patrik Laine
Michael DiPietro
Devon Levi
K'Andre Miller
Nikita Klepov
Victor Eklund
Jonathan Marchessault
Darnell Nurse
Peyton Krebs
Justin Faulk
Benjamin Kindel
Brayden Schenn
Pavel Mintyukov
Devin Cooley
Thatcher Demko
Jordan Binnington
Charlie Lindgren
Eeli Tolvanen
Oliver Ekman-Larsson
Morgan Frost
Shane Wright
Tony DeAngelo
Owen Power
Tommy Novak
Kyle Palmieri
Calum Ritchie
Dennis Hildeby
Nick Robertson
Adin Hill
Anthony Stolarz
Gustav Forsling
Alex Newhook
Kent Johnson
Kiefer Sherwood
Mathieu Olivier
Brent Burns
Drew Doughty
Aaron Ekblad
Ridly Greig
Fabian Zetterlund
Chandler Stephenson
William Karlsson
Kaapo Kakko
Casey Mittelstadt
Kevin Lankinen
Conor Garland
Jamie Benn
Michael Bunting
Alex Killorn
Teuvo Teravainen
Jordan Staal
Noah Ostlund
Esa Lindell
Morgan Rielly
Caleb Desnoyers
Philipp Grubauer
Nikita Zadorov
Jordan Spence
Zach Bolduc
Dmitry Voronkov
Dalibor Dvorsky
Matias Maccelli
Connor Brown
Justin Sourdif
Emmitt Finnie
J.J. Moser
Ryan Shea
Berkly Catton
Artem Zub
John Marino
Cam Fowler
Arseny Gritsyuk
Simon Holmstrom
Dmitry Orlov
Sam Dickinson
Jake Walman
Andrew Copp
Evan Rodrigues
Damon Severson
Eetu Luostarinen
Linus Karlsson
Jean-Gabriel Pageau
Marat Khusnutdinov
Ivan Provorov
Sam Rinzel
Sean Durzi
Alexandre Texier
Ross Colton
Trevor Moore
Ryan Donato
Noah Hanifin
Stuart Skinner
Oliver Bjorkstrand
Tristan Jarry
Parker Kelly
Joel Farabee
Cole Eiserman
Gage Goncalves
A.J. Greer
Jonathan Lekkerimaki
Ryan Poehling
Brady Martin
Mikael Backlund
Jiri Kulich
Liam Ohgren
Ilya Mikheyev
Justin Brazeau
Nate Danielson
Kirby Dach
Rutger McGroarty
Isak Rosen
Michael Brandsegg-Nygard
Colten Ellis
Marco Kasper
Sean Walker
Axel Sandin Pellikka
Connor Zary
Ryan Strome
Jonathan Huberdeau
Cole Sillinger
Victor Olofsson
Yegor Sharangovich
Andre Burakovsky
Josh Manson
Alex Bump
Logan Mailloux
Lian Bischel
Carter Yakemchuk
Jagger Firkus`.split("\n");

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseOptions(argv: string[]): {
  target: "development" | "production";
  apply: boolean;
} {
  const targetIndex = argv.indexOf("--target");
  const target = targetIndex === -1 ? undefined : argv[targetIndex + 1];
  if (target !== "development" && target !== "production") {
    throw new Error("Pass an explicit --target development or --target production.");
  }
  return { target, apply: argv.includes("--apply") };
}

function numericValue(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

type SourceIdentity = {
  position?: string;
  team?: string;
};

// Add an identity only when the article player has a same-name NHL peer.
// These values identify the player in the Daily Faceoff list, not the current
// team/position displayed by a stale or duplicate local player record.
const SOURCE_IDENTITY_BY_NAME: Readonly<Record<string, SourceIdentity>> = {
  [normalizeName("Sebastian Aho")]: { position: "C" },
  [normalizeName("Elias Pettersson")]: { position: "C" },
  [normalizeName("Sergei Murashov")]: { team: "PIT" },
};

function listValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? [value]
      : [];
}

function describePlayer(player: PlayerRow): string {
  const positions = listValue(player.nhlPos).join("/") || "unknown position";
  const teams = listValue(player.nhlTeam).join("/") || "unknown team";
  return `${player.fullName ?? "Unnamed"} (${positions}, ${teams}; ${player.id})`;
}

function matchesSourceIdentity(
  player: PlayerRow,
  identity: SourceIdentity | undefined,
): boolean {
  if (!identity) return true;
  if (identity.position && !listValue(player.nhlPos).includes(identity.position)) {
    return false;
  }
  if (
    identity.team &&
    !listValue(player.nhlTeam).some(
      (team) => team.toUpperCase() === identity.team,
    )
  ) {
    return false;
  }
  return true;
}

function describeSourceIdentity(identity: SourceIdentity | undefined): string {
  if (!identity) return "";
  return `; expected ${[identity.position, identity.team].filter(Boolean).join("/")}`;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const topRankings = new Map<string, { name: string; rank: number }>();
  TOP_300.forEach((name, index) => {
    topRankings.set(normalizeName(name), { name, rank: index + 1 });
  });

  configureConvexTarget(options.target);
  const players = await fetchModel<PlayerRow>("Player");
  const playersByName = new Map<string, PlayerRow[]>();
  for (const player of players) {
    if (!player.fullName) continue;
    const key = normalizeName(player.fullName);
    playersByName.set(key, [...(playersByName.get(key) ?? []), player]);
  }

  const unresolvedIdentities = [
    ...new Map(
      [...TOP_300, ...ON_THE_BUBBLE].map((name) => [normalizeName(name), name]),
    ),
  ].flatMap(([key, name]) => {
    const matches = playersByName.get(key) ?? [];
    const identity = SOURCE_IDENTITY_BY_NAME[key];
    const identityMatches = matches.filter((player) =>
      matchesSourceIdentity(player, identity),
    );
    if (matches.length === 0 || identityMatches.length === 1) return [];
    return [
      `${name}${describeSourceIdentity(identity)}: ${matches.map(describePlayer).join("; ")}`,
    ];
  });
  if (unresolvedIdentities.length) {
    throw new Error(
      `Unresolved Daily Faceoff player identities:\n${unresolvedIdentities.join("\n")}`,
    );
  }

  const resolvePlayer = (key: string, name: string): PlayerRow | null => {
    const matches = playersByName.get(key) ?? [];
    const identityMatches = matches.filter((player) =>
      matchesSourceIdentity(player, SOURCE_IDENTITY_BY_NAME[key]),
    );
    if (identityMatches.length > 1) {
      throw new Error(
        `Ambiguous player identity ${name}: ${identityMatches.map(describePlayer).join("; ")}`,
      );
    }
    return identityMatches[0] ?? null;
  };
  const rankedPlayers = [...topRankings.entries()].flatMap(([key, ranking]) => {
    const player = resolvePlayer(key, ranking.name);
    return player ? [{ player, rank: ranking.rank }] : [];
  });
  const bubblePlayers = ON_THE_BUBBLE.flatMap((name) => {
    const player = resolvePlayer(normalizeName(name), name);
    return player ? [player] : [];
  }).sort(
    (left, right) =>
      numericValue(right.overallRating, Number.NEGATIVE_INFINITY) -
        numericValue(left.overallRating, Number.NEGATIVE_INFINITY) ||
      numericValue(left.overallRk, Number.POSITIVE_INFINITY) -
        numericValue(right.overallRk, Number.POSITIVE_INFINITY) ||
      (left.fullName ?? "").localeCompare(right.fullName ?? ""),
  );
  const rankings = [
    ...rankedPlayers,
    ...bubblePlayers.map((player, index) => ({ player, rank: TOP_300.length + index + 1 })),
  ];
  const updates = rankings.flatMap(({ player, rank }) =>
    player.dailyFaceoffRk !== rank
      ? [{ id: player.id, fullName: player.fullName, rank }]
      : [],
  );

  console.log(
    JSON.stringify(
      {
        source: ARTICLE_URL,
        target: options.target,
        apply: options.apply,
        top300SourceRankings: TOP_300.length,
        onTheBubbleSourcePlayers: ON_THE_BUBBLE.length,
        matchedTop300: rankedPlayers.length,
        matchedOnTheBubble: bubblePlayers.length,
        onTheBubbleOrdering: "overallRating desc, overallRk asc, fullName asc",
        matched: rankings.length,
        updates: updates.length,
        unmatched: TOP_300.length + ON_THE_BUBBLE.length - rankings.length,
        sample: updates.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (!options.apply) return;
  for (const update of updates) {
    await updateById<PlayerRow>("Player", update.id, {
      dailyFaceoffRk: update.rank,
    });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
