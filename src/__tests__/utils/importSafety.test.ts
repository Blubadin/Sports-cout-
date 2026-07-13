import { describe, expect, it } from "vitest";
import { getImportPayloadCounts, validateImportFileSize } from "../../utils/importSafety";

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

  it("counts projects stored inside an IndexedDB recovery envelope", () => {
    expect(getImportPayloadCounts({
      type: "localStorageRecovery",
      indexedDbProjects: {
        projects: [{ events: [{ id: "1" }] }, { events: [] }],
      },
    })).toEqual({ projects: 2, events: 1 });
  });
});
