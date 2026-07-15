import { describe, expect, it } from "vitest";
import { buildAnalyticsSummary, buildFieldMapRecords } from "../../utils/analyticsEngine";
import type { SportType } from "../../types";
import { createGoldenSportEvents, goldenAnalyticsEvents, goldenTeams } from "../fixtures/goldenAnalytics";

describe("analyticsEngine golden datasets", () => {
  it.each(["volleyball", "football", "badminton", "basketball"] as SportType[])(
    "keeps event, action, outcome, and precision totals aligned for %s",
    (sport) => {
      const summary = buildAnalyticsSummary(createGoldenSportEvents(sport), {
        sportType: sport,
        teams: goldenTeams,
      });

      expect(summary.totalEvents).toBe(20);
      expect(summary.totalActions).toBe(20);
      expect(summary.eventResultCounts).toEqual({ Yes: 10, Out: 5, Pass: 5 });
      expect(summary.actionResultCounts).toEqual({ Yes: 10, Out: 5, Pass: 5 });
      expect(summary.precisionCounts).toEqual({ Point: 5, Detailed: 5, Zone: 5, Out: 3, Unknown: 2 });
      expect(summary.derivedOutcomePoints).toEqual({
        total: 15,
        byTeam: { A: 5, B: 10 },
        earnedByTeam: { A: 5, B: 5 },
        opponentErrorByTeam: { B: 5 },
      });
    },
  );

  it("combines all four sports without changing the meaning of totals", () => {
    const summary = buildAnalyticsSummary(goldenAnalyticsEvents, { sportType: "ALL", teams: goldenTeams });
    expect(summary.totalEvents).toBe(80);
    expect(summary.totalActions).toBe(80);
    expect(summary.derivedOutcomePoints.total).toBe(60);
    expect(Object.values(summary.skillCounts).reduce((sum, value) => sum + value, 0)).toBe(80);
  });
});

describe("buildFieldMapRecords", () => {
  it("filters at action level and sorts sequence records by action time", () => {
    const events = createGoldenSportEvents("volleyball");
    const teamBSkill = events[1].actions[0].skillCode;
    const records = buildFieldMapRecords(events, {
      sportType: "volleyball",
      team: "B",
      skill: teamBSkill,
      result: "Yes",
      timeFrom: 0,
      timeTo: 30,
    });

    expect(records.length).toBeGreaterThan(0);
    expect(records.every(record => record.teamCode === "B")).toBe(true);
    expect(records.every(record => record.skillCode === teamBSkill)).toBe(true);
    expect(records.every(record => record.resultCode === "Yes")).toBe(true);
    expect(records.map(record => record.videoTime)).toEqual(
      [...records].map(record => record.videoTime).sort((a, b) => a - b),
    );
  });

  it("can isolate fouls without treating missing coordinates as precise", () => {
    const records = buildFieldMapRecords(createGoldenSportEvents("football"), {
      sportType: "football",
      foul: "with-foul",
    });
    expect(records).toHaveLength(2);
    expect(records.every(record => record.foulCode)).toBe(true);
  });

  it("accepts either an out area code or its detailed out-zone in map filters", () => {
    const events = createGoldenSportEvents("volleyball");
    expect(buildFieldMapRecords(events, { sportType: "volleyball", area: "OUT" })).toHaveLength(3);
    expect(buildFieldMapRecords(events, { sportType: "volleyball", area: "side_left_near" })).toHaveLength(3);
  });
});
