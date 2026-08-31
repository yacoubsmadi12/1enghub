import { describe, expect, it } from "vitest";
import { inspectProjectArchive, normalizeArchivePath } from "./archive";

const ZIP_FIXTURE = "UEsDBAoAAAAAAHwtHl0AAAAAAAAAAAAAAAAEABwAc3JjL1VUCQADG8OTahvDk2p1eAsAAQToAwAABOgDAABQSwMECgAAAAAAfC0eXUPjhTAYAAAAGAAAAAwAHABzcmMvaW5kZXgudHNVVAkAAxvDk2obw5NqdXgLAAEE6AMAAAToAwAAZXhwb3J0IGNvbnN0IG9rID0gdHJ1ZTsKUEsDBAoAAAAAAHwtHl0AAAAAAAAAAAAAAAAFABwAZG9jcy9VVAkAAxvDk2obw5NqdXgLAAEE6AMAAAToAwAAUEsDBAoAAAAAAHwtHl01zBmiCAAAAAgAAAAPABwAZG9jcy9ydW5ib29rLm1kVVQJAAMbw5NqG8OTanV4CwABBOgDAAAE6AMAAHJ1bmJvb2sKUEsDBAoAAAAAAHwtHl0VJfx7CQAAAAkAAAAJABwAUkVBRE1FLm1kVVQJAAMbw5NqG8OTanV4CwABBOgDAAAE6AMAACMgRU5HSFVCClBLAQIeAwoAAAAAAHwtHl0AAAAAAAAAAAAAAAAEABgAAAAAAAAAEADtQQAAAABzcmMvVVQFAAMbw5NqdXgLAAEE6AMAAAToAwAAUEsBAh4DCgAAAAAAfC0eXUPjhTAYAAAAGAAAAAwAGAAAAAAAAQAAAKSBPgAAAHNyYy9pbmRleC50c1VUBQADG8OTanV4CwABBOgDAAAE6AMAAFBLAQIeAwoAAAAAAHwtHl0AAAAAAAAAAAAAAAAFABgAAAAAAAAAEADtQZwAAABkb2NzL1VUBQADG8OTanV4CwABBOgDAAAE6AMAAFBLAQIeAwoAAAAAAHwtHl01zBmiCAAAAAgAAAAPABgAAAAAAAEAAACkgdsAAABkb2NzL3J1bmJvb2subWRVVAUAAxvDk2p1eAsAAQToAwAABOgDAABQSwECHgMKAAAAAAB8LR5dFSX8ewkAAAAJAAAACQAYAAAAAAABAAAApIEsAQAAUkVBRE1FLm1kVVQFAAMbw5NqdXgLAAEE6AMAAAToAwAAUEsFBgAAAAAFAAUAiwEAAHgBAAAAAA==";

describe("project archive extraction", () => {
  it("unpacks a ZIP and returns a project manifest", async () => {
    const project = await inspectProjectArchive(Buffer.from(ZIP_FIXTURE, "base64"), "network-tool.zip", "application/zip");
    expect(project.format).toBe("zip");
    expect(project.isArchive).toBe(true);
    expect(project.fileCount).toBe(3);
    expect(project.entries.map(entry => entry.relativePath).sort()).toEqual(["README.md", "docs/runbook.md", "src/index.ts"]);
    expect(project.totalBytes).toBe(41);
  });

  it("rejects traversal paths", () => {
    expect(() => normalizeArchivePath("../../etc/passwd")).toThrow(/unsafe file path/i);
    expect(() => normalizeArchivePath("/absolute/path.txt")).toThrow(/unsafe file path/i);
  });

  it("normalizes harmless archive paths", () => {
    expect(normalizeArchivePath("src/index.ts")).toBe("src/index.ts");
  });
});
