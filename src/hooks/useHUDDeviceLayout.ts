import { useState, useEffect } from "react";
import { useScoutContext } from "../context/ScoutContext";

export type HUDDeviceLayout = {
  device: "phone" | "tablet" | "desktop";
  orientation: "portrait" | "landscape";
  experienceMode: "pro" | "phone";
  isCoarsePointer: boolean;
  touchTarget: number;
  compact: boolean;
};

export function useHUDDeviceLayout(): HUDDeviceLayout {
  const { settings } = useScoutContext();
  const experienceModeSetting = settings?.hudExperienceMode ?? "auto";

  const [layout, setLayout] = useState<HUDDeviceLayout>({
    device: "desktop",
    orientation: "landscape",
    experienceMode: "pro",
    isCoarsePointer: false,
    touchTarget: 44,
    compact: false,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const orientation = width > height ? "landscape" : "portrait";

      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const minDimension = Math.min(width, height);

      let device: "phone" | "tablet" | "desktop" = "desktop";

      if (isCoarsePointer) {
        if (minDimension < 600) {
          device = "phone";
        } else {
          device = "tablet";
        }
      } else {
        if (
          width < 768 ||
          (orientation === "landscape" && width < 960 && height < 500)
        ) {
          device = "phone";
        } else {
          device = "desktop";
        }
      }

      let experienceMode: "pro" | "phone" = "pro";

      if (experienceModeSetting === "auto") {
        if (device === "phone") {
          experienceMode = "phone";
        } else {
          experienceMode = "pro"; // tablet and desktop get pro
        }
      } else {
        experienceMode = experienceModeSetting;
      }

      setLayout({
        device,
        orientation,
        experienceMode,
        isCoarsePointer,
        touchTarget: isCoarsePointer ? 48 : 44,
        compact: device === "phone",
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [experienceModeSetting]);

  return layout;
}
