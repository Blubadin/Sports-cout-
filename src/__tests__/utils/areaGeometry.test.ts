import { describe, expect, it } from "vitest";
import {
  getAreaPrecision,
  resolveAreaDisplayPoint,
  resolveAreaSelectionFromPoint,
  resolveVisibleCourtSide,
} from "../../utils/areaGeometry";
import type { SportType } from "../../types";

const innerPoint = { rx: 0.25, ry: 0.25 };

const resolve = (sportType: SportType, flipCourtSide: boolean) =>
  resolveAreaSelectionFromPoint({
    sportType,
    point: innerPoint,
    flipCourtSide,
    enableOutOfBoundsZones: true,
    areaPrecisionMode: "normal",
    uiLanguage: "en",
  });

describe("resolveAreaSelectionFromPoint court orientation", () => {
  it("uses one shared physical-side rule for normal input, HUD and future controllers", () => {
    expect(resolveVisibleCourtSide("primary", false)).toBe("teamA");
    expect(resolveVisibleCourtSide("opponent", false)).toBe("teamB");
    expect(resolveVisibleCourtSide("primary", true)).toBe("teamB");
    expect(resolveVisibleCourtSide("opponent", true)).toBe("teamA");
  });

  it.each([
    ["volleyball", "LB", "teamA", "teamB"],
    ["football", "BOX", "teamB", "teamA"],
    ["badminton", "BR", "teamB", "teamA"],
    ["basketball", "LEFT_WING", "teamB", "teamA"],
  ] as const)(
    "keeps the visible %s zone stable and only swaps its physical court side",
    (sportType, areaCode, normalSide, flippedSide) => {
      const normal = resolve(sportType, false);
      const flipped = resolve(sportType, true);

      expect(normal).toMatchObject({ areaCode, courtSide: normalSide });
      expect(flipped).toMatchObject({ areaCode, courtSide: flippedSide });
    },
  );

  it("does not mirror an out-of-bounds selection when the court side changes", () => {
    const normal = resolveAreaSelectionFromPoint({
      sportType: "volleyball",
      point: { rx: 0.05, ry: 0.25 },
      flipCourtSide: false,
      enableOutOfBoundsZones: true,
    });
    const flipped = resolveAreaSelectionFromPoint({
      sportType: "volleyball",
      point: { rx: 0.05, ry: 0.25 },
      flipCourtSide: true,
      enableOutOfBoundsZones: true,
    });

    expect(normal).toMatchObject({
      areaCode: "OUT",
      courtSide: "neutral",
      outZone: "side_left_far",
    });
    expect(flipped).toMatchObject({
      areaCode: "OUT",
      courtSide: "neutral",
      outZone: "side_left_far",
    });
  });
});

describe("field map display geometry", () => {
  it.each([
    ["volleyball", "LN"],
    ["football", "MID_C"],
    ["badminton", "MC"],
    ["basketball", "TOP_KEY"],
  ] as const)("resolves a stable display point for %s area %s", (sportType, areaCode) => {
    const point = resolveAreaDisplayPoint(sportType, { areaCode });
    expect(point).not.toBeNull();
    expect(point!.top).toBeGreaterThanOrEqual(0);
    expect(point!.top).toBeLessThanOrEqual(100);
    expect(point!.left).toBeGreaterThanOrEqual(0);
    expect(point!.left).toBeLessThanOrEqual(100);
  });

  it("does not present unknown location as an exact center point", () => {
    expect(resolveAreaDisplayPoint("volleyball", { areaCode: "UNKNOWN" })).toBeNull();
    expect(getAreaPrecision({ areaCode: "UNKNOWN" })).toBe("Unknown");
  });

  it("uses explicit point coordinates before zone geometry", () => {
    expect(resolveAreaDisplayPoint("football", {
      areaCode: "MID_C",
      pointX: 0.25,
      pointY: 0.75,
    })).toEqual({ top: 75, left: 25 });
    expect(getAreaPrecision({ pointX: 0.25, pointY: 0.75 })).toBe("Point");
  });

  it("keeps legacy OUT codes in an out lane instead of classifying them as a court zone", () => {
    expect(getAreaPrecision({ areaCode: "OUT" })).toBe("Out");
    expect(resolveAreaDisplayPoint("badminton", { areaCode: "OUT" })).toEqual({ top: 108, left: 50 });
  });
});
