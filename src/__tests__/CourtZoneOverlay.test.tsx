import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../context/ScoutContext", () => ({
  useScoutContext: () => ({
    sportTemplate: {
      areas: [
        { code: "A", thaiName: "เอ" },
        { code: "B", thaiName: "บี" },
        { code: "C", thaiName: "ซี" },
      ],
    },
    settings: { uiLanguage: "en" },
  }),
}));

import CourtZoneOverlay from "../components/video/CourtZoneOverlay";

const validCalibration = {
  tl: [0.1, 0.1] as [number, number],
  tr: [0.9, 0.1] as [number, number],
  bl: [0.1, 0.9] as [number, number],
  br: [0.9, 0.9] as [number, number],
};

describe("CourtZoneOverlay", () => {
  it("does not crash or render a projected layer for malformed calibration", () => {
    render(
      <CourtZoneOverlay
        isVisible
        isCalibrating={false}
        onCalibrationComplete={vi.fn()}
        onCalibrationCancel={vi.fn()}
        calibrationPoints={{} as typeof validCalibration}
      />,
    );

    expect(screen.queryByTestId("projected-court-layer")).not.toBeInTheDocument();
  });

  it("maps pointer coordinates through the current SVG bounds into its responsive viewBox", () => {
    render(
      <CourtZoneOverlay
        isVisible={false}
        isCalibrating
        onCalibrationComplete={vi.fn()}
        onCalibrationCancel={vi.fn()}
      />,
    );
    const svg = screen.getByTestId("court-calibration-surface");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
      right: 1600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(svg, { clientX: 400, clientY: 720 });

    expect(svg).toHaveAttribute("viewBox", "0 0 1000 1000");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    const marker = screen.getByTestId("calibration-point-0");
    expect(marker).toHaveAttribute("cx", "250");
    expect(marker).toHaveAttribute("cy", "800");
  });

  it("renders valid projection in the same responsive viewBox without a fixed-size CSS layer", () => {
    const { container } = render(
      <CourtZoneOverlay
        isVisible
        isCalibrating={false}
        onCalibrationComplete={vi.fn()}
        onCalibrationCancel={vi.fn()}
        calibrationPoints={validCalibration}
      />,
    );

    const layer = screen.getByTestId("projected-court-layer");
    expect(layer).toHaveAttribute("viewBox", "0 0 1000 1000");
    expect(layer).toHaveAttribute("preserveAspectRatio", "none");
    expect(container.querySelector(".w-\\[1000px\\]")).not.toBeInTheDocument();
    expect(container.querySelector(".h-\\[1000px\\]")).not.toBeInTheDocument();
  });
});
