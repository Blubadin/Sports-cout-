import { describe, expect, it } from "vitest";
import {
  getLegacyVideoFileHandleKey,
  getProjectVideoFileHandleKey,
} from "../../utils/videoFileStore";

describe("video file handle storage keys", () => {
  it("scopes the persistent handle to the project instead of the file name", () => {
    expect(getProjectVideoFileHandleKey("project-a")).toBe("scout-video-handle:project-a");
    expect(getProjectVideoFileHandleKey("project-b")).not.toBe(
      getProjectVideoFileHandleKey("project-a"),
    );
  });

  it("keeps the legacy file-name key available for migration", () => {
    expect(getLegacyVideoFileHandleKey("match.mp4")).toBe("videoFileHandle-match.mp4");
  });
});
