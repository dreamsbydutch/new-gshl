export type RulebookCalloutType =
  | "official"
  | "important"
  | "example"
  | "commissioner"
  | "algorithm"
  | "info";

export type RulebookBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      numericColumns?: number[];
    }
  | {
      type: "callout";
      variant: RulebookCalloutType;
      title: string;
      content: string[];
    };

export type RulebookRule = {
  id: string;
  number: string;
  title: string;
  blocks: RulebookBlock[];
};

export type RulebookSection = {
  id: string;
  number: string;
  title: string;
  intro?: string;
  visual?: "playoffs" | "draft-order";
  rules: RulebookRule[];
};

const paragraph = (text: string): RulebookBlock => ({
  type: "paragraph",
  text,
});
const bullets = (items: string[]): RulebookBlock => ({
  type: "bullets",
  items,
});
const ordered = (items: string[]): RulebookBlock => ({
  type: "ordered",
  items,
});
const table = (
  headers: string[],
  rows: string[][],
  numericColumns?: number[],
): RulebookBlock => ({ type: "table", headers, rows, numericColumns });
const callout = (
  variant: RulebookCalloutType,
  title: string,
  content: string[],
): RulebookBlock => ({ type: "callout", variant, title, content });

export const RULEBOOK_LAST_UPDATED = "July 2026";

export const rulebookSections: RulebookSection[] = [
  {
    id: "governance",
    number: "0",
    title: "League Governance and Platform Authority",
    rules: [
      {
        id: "league-structure",
        number: "0.1",
        title: "League Structure",
        blocks: [
          bullets([
            "The GSHL consists of 14 teams.",
            "The league is divided into two conferences of seven teams each.",
          ]),
        ],
      },
      {
        id: "official-platforms",
        number: "0.2",
        title: "Official Platforms",
        blocks: [
          paragraph(
            "Yahoo Fantasy Hockey is the official source for lineup eligibility, positional eligibility, player statistics, category scoring, waivers, trades, and standard regular-season matchup results.",
          ),
          paragraph(
            "The GSHL App is the official source for contracts, player salaries, salary-cap calculations, buyouts, signing periods, signing eligibility, free-agent signing results, draft procedures, draft order, draft-order tournament matchups, home-team designations, and additional matchup results caused by NHL games not acknowledged by Yahoo.",
          ),
        ],
      },
      {
        id: "platform-disagreements",
        number: "0.3",
        title: "Platform Disagreements",
        blocks: [
          paragraph(
            "Yahoo is generally the source of truth if Yahoo and the GSHL App conflict.",
          ),
          callout("important", "When the GSHL App governs", [
            "The GSHL App is the source of truth for items Yahoo does not track or cannot properly administer: draft-order tournament matchups, home-team designations, extra NHL games not included in a Yahoo matchup period, contracts, salaries, buyouts, salary-cap matters, free-agent signing results, and draft order.",
          ]),
        ],
      },
      {
        id: "commissioner-authority",
        number: "0.4",
        title: "Commissioner Authority and Rule Changes",
        blocks: [
          paragraph(
            "The Commissioner has final authority over league administration and interpretation of the rulebook.",
          ),
          bullets([
            "Rule changes may be discussed during the offseason.",
            "The Commissioner makes final decisions on rule changes after league discussion.",
            "No rule changes are permitted during an active season except under extreme circumstances.",
            "Extreme circumstances include platform errors, major scheduling problems, or issues that threaten league integrity.",
            "Any in-season ruling should be narrowly tailored to resolve the issue at hand.",
          ]),
        ],
      },
    ],
  },
  {
    id: "rosters",
    number: "1",
    title: "Rosters",
    rules: [
      {
        id: "active-roster",
        number: "1.1",
        title: "Active Roster",
        blocks: [
          paragraph("Each team has the following active lineup:"),
          bullets([
            "2 Centers",
            "2 Left Wingers",
            "2 Right Wingers",
            "3 Defensemen",
            "1 Utility Skater",
            "1 Goalie",
            "4 Bench spots",
          ]),
        ],
      },
      {
        id: "injury-reserve",
        number: "1.2",
        title: "Injury Reserve",
        blocks: [
          bullets([
            "Each team has one IR slot and one IR+ slot.",
            "IR eligibility is determined by Yahoo.",
          ]),
        ],
      },
      {
        id: "empty-active-positions",
        number: "1.3",
        title: "Empty Active Positions",
        blocks: [
          paragraph(
            "Teams are allowed to leave active roster positions empty.",
          ),
          paragraph(
            "Lineup eligibility, position eligibility, lineup locking, IR eligibility, and player status are determined by Yahoo.",
          ),
        ],
      },
    ],
  },
  {
    id: "scoring-matchups",
    number: "2",
    title: "Scoring and Matchups",
    rules: [
      {
        id: "skater-categories",
        number: "2.1",
        title: "Skater Categories",
        blocks: [
          bullets([
            "Goals",
            "Assists",
            "Points",
            "Power-Play Points",
            "Shots",
            "Hits",
            "Blocks",
          ]),
        ],
      },
      {
        id: "goaltender-categories",
        number: "2.2",
        title: "Goaltender Categories",
        blocks: [bullets(["Wins", "Goals Against Average", "Save Percentage"])],
      },
      {
        id: "home-ice-advantage",
        number: "2.3",
        title: "Home-Ice Advantage",
        blocks: [
          paragraph(
            "If a matchup ends tied in total categories, the designated home team wins the matchup.",
          ),
          bullets([
            "Home-team designations are tracked and displayed in the GSHL App.",
            "Home-team assignments for the full season are published before the regular season begins.",
            "A home-ice win counts as a win in a team’s record.",
            "A home-ice win is treated differently from a clear win in the standings-point system.",
          ]),
        ],
      },
      {
        id: "goaltender-appearance-minimum",
        number: "2.4",
        title: "Goaltender Appearance Minimum",
        blocks: [
          paragraph(
            "Teams must receive at least two goalie appearances during each matchup. Any goalie appearance counts, whether the goalie started or appeared in relief.",
          ),
          bullets([
            "A team that fails to reach two goalie appearances concedes Wins, Goals Against Average, and Save Percentage.",
            "If both teams fail to meet the two-appearance minimum, all three goalie categories are recorded as ties.",
          ]),
        ],
      },
    ],
  },
  {
    id: "waivers-trades",
    number: "3",
    title: "Waivers and Trades",
    rules: [
      {
        id: "waivers",
        number: "3.1",
        title: "Waivers",
        blocks: [
          paragraph(
            "Dropped players remain on waivers for two days before processing through Yahoo’s Continuous Waivers / Rolling List system.",
          ),
        ],
      },
      {
        id: "trade-deadline",
        number: "3.2",
        title: "Trade Deadline",
        blocks: [
          paragraph(
            "The trade deadline is 2.5 weeks before the end of the GSHL regular season.",
          ),
          paragraph("The exact deadline will be published before each season."),
        ],
      },
      {
        id: "trade-processing",
        number: "3.3",
        title: "Trade Processing",
        blocks: [
          bullets([
            "Trades are not subject to league voting.",
            "Trades are not subject to routine Commissioner approval.",
            "Trades process immediately through Yahoo.",
          ]),
        ],
      },
      {
        id: "collusion-bad-faith",
        number: "3.4",
        title: "Collusion and Bad-Faith Transactions",
        blocks: [
          paragraph(
            "The Commissioner may investigate any transaction involving suspected collusion, roster lending, side agreements, deliberate competitive manipulation, salary-cap circumvention, or other bad-faith conduct.",
          ),
          paragraph("Potential penalties include:"),
          bullets([
            "Transaction reversal",
            "Loss of draft picks",
            "Contract penalties",
            "Suspension of league privileges",
            "Removal from the league",
          ]),
        ],
      },
      {
        id: "contracts-in-trades",
        number: "3.5",
        title: "Contracts in Trades",
        blocks: [
          paragraph(
            "Players traded while under contract retain their full contract with the acquiring team, including salary, remaining term, contract status, and associated contract conditions.",
          ),
          paragraph("Salary retention is not allowed."),
        ],
      },
    ],
  },
  {
    id: "schedule-standings",
    number: "4",
    title: "Schedule, Standings, and Tiebreakers",
    rules: [
      {
        id: "regular-season-length",
        number: "4.1",
        title: "Regular-Season Length",
        blocks: [
          paragraph(
            "The GSHL regular season runs for the duration of the NHL regular season minus three playoff weeks.",
          ),
          paragraph(
            "The regular season generally lasts 21–23 matchup weeks, depending on the NHL calendar.",
          ),
        ],
      },
      {
        id: "conference-schedule",
        number: "4.2",
        title: "Conference Schedule",
        blocks: [
          bullets([
            "Each conference contains seven teams.",
            "Each team plays every other team in its conference twice.",
            "Each conference opponent is played once at home and once away.",
            "This creates a 12-game conference schedule.",
          ]),
        ],
      },
      {
        id: "interconference-schedule",
        number: "4.3",
        title: "Interconference Schedule",
        blocks: [
          paragraph(
            "The remaining regular-season schedule consists of interconference matchups.",
          ),
          paragraph(
            "Interconference opponents and home/away assignments rotate annually where practical.",
          ),
        ],
      },
      {
        id: "standings-points",
        number: "4.4",
        title: "Standings Points",
        blocks: [
          table(
            ["Result", "Standings Points"],
            [
              ["Clear win", "3"],
              ["Home-ice win", "2"],
              ["Home-ice loss", "1"],
              ["Clear loss", "0"],
            ],
            [1],
          ),
          bullets([
            "A clear win is a matchup won outright by category scoring.",
            "A home-ice win occurs when a tied matchup is awarded to the designated home team.",
            "A home-ice loss occurs when an away team loses a tied matchup to the designated home team.",
          ]),
        ],
      },
      {
        id: "standings-tiebreakers",
        number: "4.5",
        title: "Standings Tiebreakers",
        blocks: [
          paragraph(
            "Teams are ranked by record first. Clear wins and home-ice wins count as wins. Clear losses and home-ice losses count as losses.",
          ),
          paragraph(
            "If teams have the same record, tiebreakers are applied in this order:",
          ),
          ordered([
            "Total standings points",
            "Head-to-head standings points",
            "Head-to-head category differential",
            "Overall category differential",
            "Conference standings points",
            "Conference category differential",
            "Owner Ladder Ranking",
          ]),
          bullets([
            "“Standings points” refers to the 3-2-1-0 standings system.",
            "“Category differential” means categories won minus categories lost during the applicable period.",
          ]),
        ],
      },
    ],
  },
  {
    id: "playoffs-payouts",
    number: "5",
    title: "Playoffs and Payouts",
    visual: "playoffs",
    rules: [
      {
        id: "playoff-qualification",
        number: "5.1",
        title: "Playoff Qualification",
        blocks: [
          paragraph("Eight teams qualify for the GSHL playoffs:"),
          bullets([
            "The top three teams from each conference",
            "The two best remaining teams in the overall league standings as wildcards",
          ]),
        ],
      },
      {
        id: "standard-conference-brackets",
        number: "5.2",
        title: "Standard Conference Brackets",
        blocks: [
          paragraph(
            "If each conference qualifies four playoff teams, each conference uses its normal bracket:",
          ),
          bullets(["1st seed vs. 4th seed", "2nd seed vs. 3rd seed"]),
          paragraph(
            "Wildcards remain in their own conference when each conference has four playoff teams.",
          ),
        ],
      },
      {
        id: "crossover-procedure",
        number: "5.3",
        title: "Crossover Procedure",
        blocks: [
          paragraph(
            "A crossover occurs only when one conference has five playoff teams and the other conference has three.",
          ),
          bullets([
            "The lower-seeded wildcard from the five-team conference crosses over.",
            "The higher-seeded wildcard remains in its original conference.",
            "The crossover creates two four-team conference playoff brackets.",
          ]),
        ],
      },
      {
        id: "conference-championships",
        number: "5.4",
        title: "Conference Championships and GSHL Cup Final",
        blocks: [
          bullets([
            "First-round winners play in their respective Conference Championship.",
            "Conference Championship winners advance to the annual GSHL Cup Final.",
          ]),
        ],
      },
      {
        id: "playoff-home-ice",
        number: "5.5",
        title: "Playoff Home Ice",
        blocks: [
          bullets([
            "The higher-seeded team receives home ice in each playoff round.",
            "In the GSHL Cup Final, home ice goes to the team with the stronger regular-season standing.",
          ]),
        ],
      },
      {
        id: "eliminated-teams",
        number: "5.6",
        title: "Eliminated Teams",
        blocks: [
          paragraph(
            "When a team is eliminated from the playoffs, its Yahoo roster is locked immediately.",
          ),
          paragraph(
            "The Commissioner may make administrative changes after elimination where required for contracts, buyouts, draft preparation, or error correction.",
          ),
        ],
      },
      {
        id: "league-fees-payouts",
        number: "5.7",
        title: "League Fees and Payouts",
        blocks: [
          table(
            ["Recipient", "Amount"],
            [
              ["Annual buy-in per team", "$60"],
              ["GSHL Cup Champion", "$600"],
              ["GSHL Cup Runner-Up", "$150"],
              ["League administration", "$210"],
            ],
            [1],
          ),
          paragraph(
            "Administrative funds may be used for engraving, trophies, draft food, league hosting, GSHL App costs, and similar league expenses.",
          ),
        ],
      },
    ],
  },
  {
    id: "draft",
    number: "6",
    title: "Draft",
    rules: [
      {
        id: "draft-date",
        number: "6.1",
        title: "Draft Date",
        blocks: [
          paragraph(
            "The GSHL Draft date is selected by the owner group after the NHL opening day is announced.",
          ),
        ],
      },
      {
        id: "draft-format",
        number: "6.2",
        title: "Draft Format",
        blocks: [
          paragraph(
            "The GSHL Draft consists of 15 rounds and uses a delayed snake format:",
          ),
          bullets([
            "Round 1: Picks 1 through 14",
            "Round 2: Picks 1 through 14",
            "Round 3: Picks 14 through 1",
            "Round 4: Picks 1 through 14",
            "Remaining rounds alternate direction in standard snake format",
          ]),
          paragraph(
            "Example: The snake begins after Round 2. The team selecting first overall also selects first in Round 2, last in Round 3, and first in Round 4.",
          ),
        ],
      },
      {
        id: "contract-keepers-draft-picks",
        number: "6.3",
        title: "Contract Keepers and Draft Picks",
        blocks: [
          bullets([
            "Players under contract at the start of the draft are slotted into a team’s draft class from its latest available pick upward.",
            "Each contracted player consumes one draft selection.",
            "Buyouts do not consume draft picks.",
          ]),
          paragraph(
            "Example: A team with three players under contract forfeits its 15th-, 14th-, and 13th-round selections.",
          ),
          paragraph(
            "If a team has more players under contract than available draft selections, it must resolve excess contracts through trades or buyouts before the draft.",
          ),
        ],
      },
    ],
  },
  {
    id: "draft-order-tournament",
    number: "7",
    title: "Draft Order Tournament",
    visual: "draft-order",
    rules: [
      {
        id: "draft-order-matchups",
        number: "7.1",
        title: "Draft-Order Matchups",
        blocks: [
          paragraph(
            "All teams continue to play matchups through the three GSHL playoff weeks to determine the following season’s draft order.",
          ),
          paragraph(
            "Draft-order placement games determine all 14 selections in the following season’s draft.",
          ),
        ],
      },
      {
        id: "roster-freeze",
        number: "7.2",
        title: "Roster Freeze",
        blocks: [
          bullets([
            "Rosters freeze on the final day of the GSHL regular season.",
            "Lineups are automatically set for all draft-order placement matchups using each team’s final regular-season roster.",
            "No additions, drops, trades, waiver claims, or manual lineup changes are allowed after the roster freeze for draft-order competition.",
          ]),
        ],
      },
      {
        id: "picks-1-6",
        number: "7.3",
        title: "Picks 1–6 Placement Games",
        blocks: [
          bullets([
            "Week 1: 9th place plays 10th place, 11th place plays 12th place, and 13th place plays 14th place.",
            "The losers of the 9th/10th and 11th/12th matchups begin a two-week matchup in Week 2. The winner receives pick 5 and the loser receives pick 6.",
            "Week 2: The winner of the 13th/14th matchup plays the winner of the 11th/12th matchup.",
            "Week 2: The loser of the 13th/14th matchup plays the winner of the 9th/10th matchup.",
            "Week 3: The two Week 2 semifinal winners play for picks 1 and 2. The winner receives pick 1 and the loser receives pick 2.",
            "Week 3: The two Week 2 semifinal losers play for picks 3 and 4. The winner receives pick 3 and the loser receives pick 4.",
          ]),
        ],
      },
      {
        id: "picks-7-10",
        number: "7.4",
        title: "Picks 7–10 Placement Games",
        blocks: [
          bullets([
            "Week 2: The two first-round playoff losers in each conference play one another.",
            "Week 3: The two Week 2 winners play for picks 7 and 8. The winner receives pick 7 and the loser receives pick 8.",
            "Week 3: The two Week 2 losers play for picks 9 and 10. The winner receives pick 9 and the loser receives pick 10.",
          ]),
        ],
      },
      {
        id: "picks-11-12",
        number: "7.5",
        title: "Picks 11–12 Placement Game",
        blocks: [
          paragraph(
            "The two Conference Championship losers play during the final playoff week. The winner receives pick 11 and the loser receives pick 12.",
          ),
        ],
      },
      {
        id: "picks-13-14",
        number: "7.6",
        title: "Picks 13–14",
        blocks: [
          bullets([
            "GSHL Cup Runner-Up receives pick 13.",
            "GSHL Cup Champion receives pick 14.",
          ]),
        ],
      },
    ],
  },
  {
    id: "awards",
    number: "8",
    title: "Awards",
    rules: [
      {
        id: "team-trophies",
        number: "8.1",
        title: "Team Trophies",
        blocks: [
          bullets([
            "GSHL Cup Champion",
            "President’s Trophy — Best Regular-Season Record",
            "Two-Seven-Six Trophy — Sunview Regular-Season Title",
            "Unit 4 Trophy — Hickory Hotel Regular-Season Title",
            "Adam Brophy Award — Loser’s Tournament Winner",
          ]),
        ],
      },
      {
        id: "tier-1-awards",
        number: "8.2",
        title: "Tier 1 Awards",
        blocks: [
          bullets([
            "Jack Adams Trophy — Coach of the Year",
            "GM of the Year",
            "Vezina Trophy — Best Goaltending",
            "Norris Trophy — Best Defenseman",
            "Hart Trophy — Best Team",
            "Calder Trophy — Best Draft",
          ]),
        ],
      },
      {
        id: "tier-2-awards",
        number: "8.3",
        title: "Tier 2 Awards",
        blocks: [
          bullets([
            "Rocket Richard Trophy — Most Goals",
            "Art Ross Trophy — Most Points",
            "Selke Trophy — Most Hits + Blocks",
            "Lady Byng Trophy — Most Players Used",
          ]),
        ],
      },
      {
        id: "player-trophies",
        number: "8.4",
        title: "Player Trophies",
        blocks: [
          paragraph(
            "All player awards are based on GSHL season statistics, GSHL rankings, and league-specific performance—not NHL season awards or NHL standings.",
          ),
          bullets([
            "Crosby Trophy — Best Overall Player",
            "Orr Trophy — Best Defenseman",
            "Brodeur Trophy — Best Goaltender",
            "Gretzky Trophy — Most Points",
            "Ovechkin Trophy — Most Goals",
          ]),
        ],
      },
      {
        id: "first-team-all-stars",
        number: "8.5",
        title: "First Team All-Stars",
        blocks: [
          paragraph(
            "The First Team recognizes the best regular-season players at each position, with two defensemen selected.",
          ),
        ],
      },
      {
        id: "second-team-all-stars",
        number: "8.6",
        title: "Second Team All-Stars",
        blocks: [
          paragraph(
            "The Second Team recognizes the next-best regular-season players at each position, with two additional defensemen selected.",
          ),
        ],
      },
      {
        id: "playoff-all-stars",
        number: "8.7",
        title: "Playoff All-Stars",
        blocks: [
          paragraph(
            "The Playoff All-Star Team recognizes the best playoff performers at each position, with two defensemen selected.",
          ),
        ],
      },
      {
        id: "award-definitions",
        number: "8.8",
        title: "Award Definitions",
        blocks: [
          paragraph(
            "Most Players Used: Awarded to the team with the most unique players who spent at least one day on that team’s roster during the GSHL season.",
          ),
          paragraph(
            "Best Draft: Determined by the GSHL Draft Evaluation Algorithm, which considers draft capital available to the team, perceived player value entering the season, performance of drafted players during the season, and overall value gained from the draft class.",
          ),
        ],
      },
    ],
  },
  {
    id: "salary-cap-system",
    number: "9",
    title: "Salary Cap System",
    rules: [
      {
        id: "salary-cap-scope",
        number: "9.1",
        title: "Salary Cap Scope",
        blocks: [
          paragraph(
            "The salary cap applies only to players under GSHL contract, also known as keepers, and active buyout cap charges.",
          ),
          paragraph(
            "Players selected in the annual draft do not count against the salary cap unless they later sign a contract.",
          ),
          paragraph(
            "Teams generally carry two to four contracted players, but there is no maximum number of contracts beyond the $25,000,000 hard salary cap and available draft-pick limitations.",
          ),
        ],
      },
      {
        id: "salary-cap-limit",
        number: "9.2",
        title: "Salary Cap Limit",
        blocks: [
          paragraph("The GSHL uses a hard salary cap of $25,000,000."),
          paragraph(
            "A team cannot complete a contract signing or trade that puts it over the salary cap.",
          ),
        ],
      },
      {
        id: "contract-length",
        number: "9.3",
        title: "Contract Length",
        blocks: [
          paragraph(
            "All contracts may be one, two, or three years long. Teams choose the length of each contract at signing. No contract may exceed three years.",
          ),
        ],
      },
      {
        id: "no-cap-exceptions",
        number: "9.4",
        title: "No Cap Exceptions",
        blocks: [
          paragraph(
            "The league does not allow salary retention, salary proration, cap exceptions, retained salary, or other salary-cap relief mechanisms.",
          ),
        ],
      },
      {
        id: "buyouts",
        number: "9.5",
        title: "Buyouts",
        blocks: [
          paragraph(
            "A buyout occurs immediately when a team drops a player who is under contract. The cap charge begins immediately and counts against the hard cap.",
          ),
          bullets([
            "The player’s salary is reduced by 50%.",
            "The buyout cap hit lasts for the same number of contract years remaining.",
            "If bought out in the final contract year, the 50% cap charge remains through the following GSHL season.",
            "Buyout cap charges cannot be traded or retained.",
            "Buyouts do not consume draft picks.",
          ]),
          paragraph(
            "Example: A player earning $4,000,000 with two years remaining is bought out. The team carries a $2,000,000 cap charge in each of the next two seasons.",
          ),
        ],
      },
      {
        id: "annual-player-salaries",
        number: "9.6",
        title: "Annual Player Salaries",
        blocks: [
          paragraph(
            "Eligible players receive an official GSHL salary between $1,000,000 and $10,000,000.",
          ),
          paragraph(
            "The salary algorithm analyzes the previous five years of NHL data, including performance in GSHL scoring categories, overall ice time, long-term production, and player talent estimates derived from those inputs.",
          ),
          paragraph(
            "The resulting talent estimate is converted into a GSHL salary. The official salary list is maintained in the GSHL App.",
          ),
        ],
      },
      {
        id: "fixed-contract-salary",
        number: "9.7",
        title: "Fixed Contract Salary",
        blocks: [
          paragraph(
            "A player’s salary does not change during an active contract. Players receive an updated salary only when eligible for a new contract.",
          ),
        ],
      },
      {
        id: "signing-periods",
        number: "9.8",
        title: "Signing Periods",
        blocks: [
          bullets([
            "Early Signing Period — December 15 through December 31",
            "Late Signing Period — End of GSHL Playoffs through the end of the NHL Playoffs",
            "Summer Free Agency — Stanley Cup awarded through the GSHL Draft",
          ]),
          paragraph(
            "Contracts may be signed at any time during an active signing period.",
          ),
        ],
      },
      {
        id: "consecutive-contract-limit",
        number: "9.9",
        title: "Consecutive Contract Limit",
        blocks: [
          paragraph(
            "A player may play under no more than two consecutive contracts.",
          ),
          paragraph(
            "After a player’s second consecutive contract expires, the player must return to the GSHL Draft pool and cannot receive a third consecutive contract.",
          ),
        ],
      },
      {
        id: "restricted-free-agents",
        number: "9.10",
        title: "Restricted Free Agents",
        blocks: [
          paragraph(
            "A player coming off their first consecutive contract is an RFA.",
          ),
          bullets([
            "An RFA may be signed by their eligible team at 115% of their updated GSHL salary.",
            "The team may choose a contract term of one, two, or three years.",
          ]),
        ],
      },
      {
        id: "player-signing-eligibility",
        number: "9.11",
        title: "Player Signing Eligibility",
        blocks: [
          callout("important", "Two-thirds threshold", [
            "A player may be signed only if the player spent more than two-thirds of the GSHL regular season on the signing team’s roster, measured by player-days; or the player spent more than two-thirds of the GSHL regular season on any GSHL roster, measured by player-days.",
          ]),
          paragraph(
            "This rule ensures a player was either used consistently in the GSHL or properly stashed and held by an owner for most of the season. It prevents teams from adding an injured player near the end of the season solely to create contract eligibility.",
          ),
          paragraph(
            "A player-day is one player occupying a GSHL roster spot for one calendar day.",
          ),
        ],
      },
      {
        id: "unrestricted-free-agents",
        number: "9.12",
        title: "Unrestricted Free Agents",
        blocks: [
          paragraph(
            "At the end of the Late Signing Period, every eligible player not under contract becomes a UFA.",
          ),
          paragraph(
            "UFAs can be signed by any team during Summer Free Agency.",
          ),
        ],
      },
      {
        id: "ufa-salary-premium",
        number: "9.13",
        title: "UFA Salary Premium",
        blocks: [
          paragraph(
            "UFA contracts are signed at 125% of the player’s updated GSHL salary.",
          ),
          paragraph(
            "The signing team may select a contract length of one, two, or three years.",
          ),
        ],
      },
      {
        id: "ufa-offer-process",
        number: "9.14",
        title: "UFA Offer Process",
        blocks: [
          bullets([
            "UFA offers are submitted through the GSHL App during Summer Free Agency.",
            "Once posted, an offer remains open for seven days.",
            "Other teams may submit matching offers during the seven-day period.",
            "If no other team matches, the player signs with the original offering team.",
            "If multiple teams submit matching offers, the player is assigned through the UFA Signing Algorithm.",
          ]),
        ],
      },
      {
        id: "ufa-signing-algorithm",
        number: "9.15",
        title: "UFA Signing Algorithm",
        blocks: [
          paragraph(
            "The UFA Signing Algorithm gives eligible teams a probability of signing the player.",
          ),
          paragraph("Factors include:"),
          bullets([
            "Owner Ladder Ranking",
            "Previous-season performance",
            "Other players under contract",
            "Contract length",
            "Team situation and roster construction",
            "Randomized probability weighting",
          ]),
          paragraph(
            "The specific formula and weighting are intentionally not published.",
          ),
          callout("algorithm", "Probabilistic result", [
            "The UFA process is probabilistic, not a guaranteed-priority system. A team with a stronger probability may still lose a signing because the final result includes randomness.",
          ]),
        ],
      },
    ],
  },
];

export function getRulebookSearchText(
  section: RulebookSection,
  rule: RulebookRule,
) {
  const blockText = rule.blocks.flatMap((block) => {
    if (block.type === "paragraph") return [block.text];
    if (block.type === "bullets" || block.type === "ordered")
      return block.items;
    if (block.type === "table") return [...block.headers, ...block.rows.flat()];
    return [block.title, ...block.content];
  });

  return [section.number, section.title, rule.number, rule.title, ...blockText]
    .join(" ")
    .toLocaleLowerCase();
}
