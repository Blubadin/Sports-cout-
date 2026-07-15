import { describe, expect, it } from "vitest";
import { getLocalizedVideoError } from "../../utils/videoError";

describe("getLocalizedVideoError", () => {
  it("uses the current UI language instead of a previously stored message", () => {
    expect(getLocalizedVideoError("browser_blocked", null, "en")).toBe(
      "The browser or video settings blocked embedded YouTube playback",
    );
    expect(getLocalizedVideoError("browser_blocked", null, "th")).toBe(
      "เบราว์เซอร์หรือการตั้งค่าของคลิปป้องกันการเล่น YouTube แบบฝัง",
    );
  });

  it("keeps an unknown YouTube error code useful", () => {
    expect(getLocalizedVideoError("unknown", 42, "th")).toBe(
      "YouTube Error (Error Code: 42)",
    );
  });

  it("falls back to the generic localized load error", () => {
    expect(getLocalizedVideoError("unknown", null, "th")).toBe(
      "ไม่สามารถโหลดวิดีโอได้",
    );
  });
});
