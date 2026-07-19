"use client";

import { useMemo, useState } from "react";
import { cn, normalizeSearchQuery } from "@gshl-utils";
import type { RulebookItem, RulebookSection } from "@gshl-types";

export function Rulebook() {
  const [query, setQuery] = useState("");
  const normalized = useMemo(() => normalizeSearchQuery(query), [query]);

  const renderItems = (items: RulebookItem[]) => {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.code} className="text-center">
            <div className="py-1 text-sm leading-6 text-foreground/90">
              <span className="pr-2 font-bold">{item.code}</span>
              {item.text}
            </div>
            {item.subitems && item.subitems.length > 0 ? (
              <div className="pt-1">
                {item.subitems.map((sub) => (
                  <div
                    key={sub.code}
                    className="py-1 text-xs leading-5 text-muted-foreground"
                  >
                    <span className="pr-2 font-bold">{sub.code}</span>
                    {sub.text}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const sections: RulebookSection[] = useMemo(
    () => [
      {
        id: "rosters",
        title: "Rosters",
        keywords: ["roster", "lineup", "bench", "ir", "goalies"],
        content: renderItems([
          {
            code: "1.1",
            text: "2 Centers, 2 Left Wingers, 2 Right Wingers, 3 Defensemen, 1 Utility Skater, 1 Goalie, 4 Bench Spots",
          },
          {
            code: "1.2",
            text: "Teams have 1 IR slot and 1 IR+ slot for injury relief",
          },
        ]),
      },
      {
        id: "scoring",
        title: "Scoring/Categories",
        keywords: ["scoring", "categories", "skater", "goalie", "tiebreak"],
        content: renderItems([
          {
            code: "2.1",
            text: "7 skater categories",
            subitems: [
              {
                code: "2.1.1",
                text: "Goals, Assists, Points, Powerplay Points, Shots, Hits, Blocks",
              },
            ],
          },
          {
            code: "2.2",
            text: "3 goalie categories",
            subitems: [
              {
                code: "2.2.1",
                text: "Wins, Goals Against Average, Save Percentage",
              },
            ],
          },
          {
            code: "2.3",
            text: 'Tiebreaker for all matchups is "home-ice advantage". The designated home team wins any ties.',
          },
          {
            code: "2.4",
            text: "Teams must have a minimum of 2 goalie starts during a matchup. If a team does not meet this minimum, then all 3 goalie categories are conceded",
          },
        ]),
      },
      {
        id: "waivers-trades",
        title: "Waivers/Trades",
        keywords: ["waivers", "trades", "deadline", "collusion"],
        content: renderItems([
          {
            code: "3.1",
            text: "Dropped players remain on waivers for 2 days beore being processed using Yahoo's continuous rolling list system",
          },
          {
            code: "3.2",
            text: "Trade deadline is 2.5 weeks prior to the end of the GSHL regular season",
          },
          {
            code: "3.3",
            text: "Trades are not subject to any league or commissioner approval and are processed immediately",
          },
          {
            code: "3.4",
            text: "Any trades with suspected foul play or collusion will be investigated immediately and violaters will be punished at commissioners discretion",
          },
          {
            code: "3.5",
            text: "Players under contract can be traded with their contract fully intact. No salary retention allowed.",
          },
        ]),
      },
      {
        id: "schedule",
        title: "Schedule/Tiebreakers",
        keywords: ["schedule", "tiebreak", "standings", "points"],
        content: renderItems([
          {
            code: "4.1",
            text: "The GSHL season will be the entire length of the NHL regular season minus 3 playoff weeks. 21-23 weeks depending on the year.",
          },
          {
            code: "4.2",
            text: "Each team plays a home-and-home with every team in their conference for a 14 game conference schedule",
          },
          {
            code: "4.3",
            text: "The rest of the schedule is made up of non-conference games that rotate home and away yearly",
          },
          {
            code: "4.4",
            text: "Points are awarded using a 3 point system, Win = 3 pts, Home-ice win = 2 pts, Home-ice loss = 1 pt, Loss = 0 pts",
          },
          {
            code: "4.5",
            text: "Standings Tiebreakers",
            subitems: [
              { code: "4.5.1", text: "Total Wins" },
              { code: "4.5.2", text: "Total Points" },
              { code: "4.5.3", text: "Head-to-Head Points" },
              { code: "4.5.4", text: "Head-to-Head Category Differential" },
              { code: "4.5.5", text: "Overall Category Differential" },
              { code: "4.5.6", text: "Conference Points" },
              { code: "4.5.7", text: "Conference Category Differential" },
              { code: "4.5.8", text: "Owner ladder ranking" },
            ],
          },
        ]),
      },
      {
        id: "playoffs",
        title: "Playoffs/Payouts",
        keywords: ["playoffs", "payouts", "buy-in", "wildcards"],
        content: renderItems([
          {
            code: "5.1",
            text: "Top 8 teams qualify for the playoffs",
            subitems: [
              {
                code: "5.1.1",
                text: "The top 3 teams in each conference along with the best two remaining teams as wildcards",
              },
              {
                code: "5.1.2",
                text: "Each conference will play 1 v 4 and 2 v 3",
              },
              {
                code: "5.1.3",
                text: "If a crossover is required then the #1 overall team will play the second wildcard and the other Conference champion will play the first wildacrd",
              },
            ],
          },
          {
            code: "5.2",
            text: "Second round playoff matchups are the Conference Championship games",
          },
          {
            code: "5.3",
            text: "Both Conference Championship winners will play in the annual GSHL Cup Final",
          },
          {
            code: "5.4",
            text: "When a team is eliminated from the playoffs their roster is locked immediately",
          },
          {
            code: "5.5",
            text: "The yearly buy-in for each team is $60. Yearly Payouts are $600 for the GSHL Cup champion, $150 for the GSHL Cup runner up, and the final $210 go to admin fees (engraving, draft food, etc.)",
          },
        ]),
      },
      {
        id: "draft",
        title: "Draft",
        keywords: ["draft", "thanksgiving", "snake"],
        content: renderItems([
          {
            code: "6.1",
            text: "The GSHL Draft date will be chosen by owner pool as soon as the NHL opening day is announced",
          },
          {
            code: "6.2",
            text: "The GSHL Draft is 15 rounds long and follows a delayed snake draft format. The snake does not begin until after the 2nd round",
          },
          {
            code: "6.3",
            text: "Players under contract at the start of the draft will be slotted in to a teams draft class from their worst pick and up",
          },
        ]),
      },
      {
        id: "lottery",
        title: "Draft Order",
        keywords: ["draft order"],
        content: renderItems([
          {
            code: "7.1",
            text: "Draft Order",
            subitems: [
              {
                code: "7.1.1",
                text: "All teams will continue to play matchups through the 3 playoff weeks to set the draft order",
              },
              {
                code: "7.1.2",
                text: "Rosters will be frozen on the final day of the regular season and lineups wll be auto set for these draft order matchups",
              },
              {
                code: "7.1.3",
                text: "9th and 10th play in week 1, 11th and 12th play in week 1, winners move on the final four, losers play a two week matchup for the 5th and 6th pick. 13th and 14th also play in week 1 for placement, winner of that matchup gets the winner of the 11th/ 12th game in week 2, the loser gets the winner of the 9th/0th game in week 2. WInners of these two week 2 matchups then play in week 3 for the 1st overall pick with the winenr getting #1, losers of the week 2 matchups then play for the 3rd and 4th pick in week 3",
              },
              {
                code: "7.1.4",
                text: "The two first round losers in each conference play in week 2, winners then matchup and play for 7th and 8th pick in week 3, losers play for 9th and 10th pick in week 3",
              },
              {
                code: "7.1.5",
                text: "The two conference finals losers matchup in the final week for picks 11th and 12th, winner gets 11th and loser gets 12th pick",
              },
              {
                code: "7.1.6",
                text: "The GSHL Champion receives the 14th pick and runner up receives the 13th pick",
              },
            ],
          },
        ]),
      },
      {
        id: "awards",
        title: "Awards",
        keywords: ["awards", "rocket richard", "hart", "vezina", "norris"],
        content: renderItems([
          {
            code: "8.1",
            text: "Team Trophies",
            subitems: [
              { code: "8.1.1", text: "GSHL Cup Champion" },
              {
                code: "8.1.2",
                text: "President's Trophy - Best Regular Season Record",
              },
              {
                code: "8.1.3",
                text: "Two-Seven-Six Trophy - Sunview Regular Season Title",
              },
              {
                code: "8.1.4",
                text: "Unit 4 Trophy - Hickory Hotel Regular Season Title",
              },
              {
                code: "8.1.5",
                text: "Adam Brophy Award - Loser's Tournament 'Winner'",
              },
            ],
          },
          {
            code: "8.2",
            text: "Tier 1 Awards",
            subitems: [
              { code: "8.2.1", text: "Jack Adams - Coach of the Year" },
              { code: "8.2.2", text: "GM of the Year" },
              { code: "8.2.3", text: "Vezina - Best Goaltending" },
              { code: "8.2.4", text: "Norris - Best Defensemen" },
              { code: "8.2.5", text: "Hart - Best Team" },
              { code: "8.2.6", text: "Calder - Best Draft" },
            ],
          },
          {
            code: "8.3",
            text: "Tier 2 Awards",
            subitems: [
              { code: "8.3.1", text: "Rocket Richard - Most Goals" },
              { code: "8.3.2", text: "Art Ross - Most Points" },
              { code: "8.3.3", text: "Selke - Most Hits + Blocks" },
              { code: "8.3.4", text: "Lady Byng - Most Players Used" },
            ],
          },
        ]),
      },
      {
        id: "salary-cap",
        title: "Salary Cap System",
        keywords: ["salary", "cap", "contracts", "ufa", "rfa", "signing"],
        content: renderItems([
          {
            code: "9.1",
            text: "The Salary Cap only applies to your players under contract each year or 'keepers', the rest of your roster is filled in through the yearly GSHL draft. Generally 2-4 keepers per team",
          },
          {
            code: "9.2",
            text: "The Salary Cap has a hard limit of $25,000,000",
          },
          {
            code: "9.3",
            text: "There is a 3-year maximum on all contracts and teams can sign as many contracts as they would like",
          },
          {
            code: "9.4",
            text: "There is no retention, proration, or exceptions allowed with salaries or the salary cap",
          },
          {
            code: "9.5",
            text: "Buyouts are when a player under contract is dropped by the team. That players salary is cut in half for the same number of years, if a buyout is done in the final year of a contract a year is added and the buyout ends at the end of the following season",
          },
          {
            code: "9.6",
            text: "Every player to play in the NHL in the past 2 years is assigned a salary between $10,000,000 and $1,000,000 at the start of each signing period",
          },
          {
            code: "9.7",
            text: "A players salary does not change for the length of the contract",
          },
          {
            code: "9.8",
            text: "There are two signing periods every year and the summer free agency period",
            subitems: [
              {
                code: "9.8.1",
                text: "Early Signing Period starts on December 15th and finishes on December 31st",
              },
              {
                code: "9.8.2",
                text: "Late Signing Period starts at the end of the GSHL Playoffs and finishes at the end of the NHL playoffs. (GSHL Cup to Stanley Cup)",
              },
              {
                code: "9.8.3",
                text: "Free Agency starts when the Stanley Cup is awarded and finishes at the GSHL Draft",
              },
            ],
          },
          {
            code: "9.9",
            text: "Contracts can be signed at any point during a signing period",
          },
          {
            code: "9.10",
            text: "Players can only play under 2 consecutive contracts. Players coming off of their second consecutive contract must go back in to the draft pool",
          },
          {
            code: "9.11",
            text: "Players coming off of their first contract are considered RFAs and can be signed for 115% of their updated salary",
          },
          {
            code: "9.12",
            text: "Players are only eligible to be signed to a contract if they have been on a GSHL roster for over 2/3 of the season or on that GSHL roster for over 1/3 of the season",
          },
          {
            code: "9.13",
            text: "At the end of the late signing period, every player that is not under contract becomes a UFA",
          },
          {
            code: "9.14",
            text: "UFAs can be signed by any team for a 125% premium",
          },
          {
            code: "9.15",
            text: "UFA contract offers can be submitted at any time. Once a UFA contract offer is posted to the league, any other owner has 7 days to match the offer. If no other owner matches the offer, then the UFA is signed to that team. If another owner matches the offer, then the UFA makes a decision on which team to sign with via a signing algorithm. The algorithm is based on things like owner ladder ranking, previous season performance, other players under contract, length of contract",
          },
        ]),
      },
    ],
    [],
  );

  const filtered = useMemo(() => {
    if (!normalized) return sections;

    return sections.filter((section) => {
      const inTitle = section.title.toLowerCase().includes(normalized);
      const inKeywords = (section.keywords ?? []).some((k) =>
        k.toLowerCase().includes(normalized),
      );
      return inTitle || inKeywords;
    });
  }, [normalized, sections]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 flex flex-col gap-3">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Rulebook</h1>
          <p className="text-sm text-muted-foreground">
            League rules and reference information
          </p>
        </div>

        <div className="flex items-center justify-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections (e.g., draft, contracts, playoffs)"
            className={cn(
              "w-full max-w-xl rounded-md border bg-background px-3 py-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtered.map((section) => (
          <div
            key={section.id}
            className="rounded-lg border bg-card p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <a
                href={`#${section.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                Link
              </a>
            </div>
            <div id={section.id}>{section.content}</div>
          </div>
        ))}

        {filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No matching sections.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
