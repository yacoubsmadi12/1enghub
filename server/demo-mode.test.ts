import { describe, expect, it } from "vitest";
import { selectLiveOrDemo } from "../shared/demo-mode";

describe("selectLiveOrDemo", () => {
  it("uses demo content before authentication or the live query completes", () => {
    expect(selectLiveOrDemo({ authenticated: false, fetched: false, live: [], demo: ["demo"] })).toEqual(["demo"]);
  });
  it("uses live PostgreSQL content when available", () => {
    expect(selectLiveOrDemo({ authenticated: true, fetched: true, live: ["live"], demo: ["demo"] })).toEqual(["live"]);
  });
  it("preserves a valid empty live workspace", () => {
    expect(selectLiveOrDemo({ authenticated: true, fetched: true, live: [], demo: ["demo"] })).toEqual([]);
  });
});
