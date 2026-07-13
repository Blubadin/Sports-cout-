import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getImportPayloadCounts, validateImportFileSize } from "../../utils/importSafety";

const errorOverlaySource = readFileSync(resolve(process.cwd(), "public/error-overlay.js"), "utf8");

describe("importSafety", () => {
  it("rejects JSON files larger than 10 MB before reading them", () => {
    expect(validateImportFileSize(10 * 1024 * 1024)).toBe(true);
    expect(validateImportFileSize(10 * 1024 * 1024 + 1)).toBe(false);
  });

  it("counts projects and events in a versioned project bundle", () => {
    const counts = getImportPayloadCounts({
      type: "projects",
      projects: [
        { events: [{ id: "1" }, { id: "2" }] },
        { events: [{ id: "3" }] },
      ],
    });

    expect(counts).toEqual({ projects: 2, events: 3 });
  });

  it("treats a legacy event array as one imported project", () => {
    expect(getImportPayloadCounts([{ id: "1" }, { id: "2" }])).toEqual({
      projects: 1,
      events: 2,
    });
  });

  it("counts projects stored inside a legacy IndexedDB recovery envelope without appVersion", () => {
    const recovery = {
      schemaVersion: "1.1",
      app: "SPORTSCOUT",
      type: "localStorageRecovery",
      indexedDbProjects: {
        projects: [{ events: [{ id: "1" }] }, { events: [] }],
      },
    };

    expect(recovery).not.toHaveProperty("appVersion");
    expect(getImportPayloadCounts(recovery)).toEqual({ projects: 2, events: 1 });
  });

  it("keeps runtime recovery metadata dynamic and includes the IndexedDB project envelope", () => {
    expect(errorOverlaySource).not.toContain("0.11.0-pilot.1");
    expect(errorOverlaySource).toContain('meta[name="sportscout-app-version"]');
    expect(errorOverlaySource).toContain("async function exportRuntimeRecovery");
    expect(errorOverlaySource).toContain("keyval-store");
    expect(errorOverlaySource).toContain("keyval");
    expect(errorOverlaySource).toContain("scout-projects:v1.1");
    expect(errorOverlaySource).toContain("indexedDbProjects");
    expect(errorOverlaySource).toContain("localStorageRecovery");
  });
});
