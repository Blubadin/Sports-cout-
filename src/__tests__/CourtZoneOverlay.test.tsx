import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const scoutState = vi.hoisted(() => ({ uiLanguage: "en" as "en" | "th" }));

vi.mock("../context/ScoutContext", () => ({
  useScoutContext: () => ({
    sportTemplate: {
      areas: [
        { code: "A", thaiName: "เอ" },
        { code: "B", thaiName: "บี" },
        { code: "C", thaiName: "ซี" },
      ],
    },
    settings: { uiLanguage: scoutState.uiLanguage },
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
  const mockCalibrationBounds = (svg: HTMLElement) => {
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  };

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

  it("clears an unfinished draft after cancel before calibration is reopened", () => {
    const onCalibrationCancel = vi.fn();
    const props = {
      isVisible: false,
      onCalibrationComplete: vi.fn(),
      onCalibrationCancel,
    };
    const { rerender } = render(<CourtZoneOverlay {...props} isCalibrating />);
    const svg = screen.getByTestId("court-calibration-surface");
    mockCalibrationBounds(svg);

    fireEvent.click(svg, { clientX: 100, clientY: 100 });
    fireEvent.click(svg, { clientX: 900, clientY: 100 });
    fireEvent.click(svg, { clientX: 100, clientY: 900 });
    expect(screen.getAllByTestId(/calibration-point-/)).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Cancel calibration" }));
    expect(onCalibrationCancel).toHaveBeenCalledTimes(1);
    rerender(<CourtZoneOverlay {...props} isCalibrating={false} />);
    rerender(<CourtZoneOverlay {...props} isCalibrating />);

    expect(screen.queryByTestId("calibration-point-0")).not.toBeInTheDocument();
    expect(screen.getByText("Click Top-Left corner")).toBeInTheDocument();
  });

  it("clears an unfinished draft when calibration exits externally", () => {
    const props = {
      isVisible: false,
      onCalibrationComplete: vi.fn(),
      onCalibrationCancel: vi.fn(),
    };
    const { rerender } = render(<CourtZoneOverlay {...props} isCalibrating />);
    const svg = screen.getByTestId("court-calibration-surface");
    mockCalibrationBounds(svg);
    fireEvent.click(svg, { clientX: 400, clientY: 400 });
    expect(screen.getByTestId("calibration-point-0")).toBeInTheDocument();

    rerender(<CourtZoneOverlay {...props} isCalibrating={false} />);
    rerender(<CourtZoneOverlay {...props} isCalibrating />);

    expect(screen.queryByTestId("calibration-point-0")).not.toBeInTheDocument();
  });

  it("localizes the cancel action and labels the projection as experimental", () => {
    scoutState.uiLanguage = "th";
    const { rerender } = render(
      <CourtZoneOverlay
        isVisible={false}
        isCalibrating
        onCalibrationComplete={vi.fn()}
        onCalibrationCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "ยกเลิกการปรับเทียบสนาม" })).toBeInTheDocument();
    expect(screen.getByText("ฟีเจอร์ทดลอง: เส้นแบ่งพื้นที่เป็นเพียงค่าประมาณ")).toBeInTheDocument();

    scoutState.uiLanguage = "en";
    rerender(
      <CourtZoneOverlay
        isVisible
        isCalibrating={false}
        onCalibrationComplete={vi.fn()}
        onCalibrationCancel={vi.fn()}
        calibrationPoints={validCalibration}
      />,
    );
    expect(screen.getByText("Experimental: projected zones are approximate")).toBeInTheDocument();
  });
});
