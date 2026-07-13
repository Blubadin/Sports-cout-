import { describe, expect, it } from "vitest";
import { resolveAreaSelectionFromPoint } from "../../utils/areaGeometry";
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
