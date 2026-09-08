import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";

describe("styl przycisku disabled", () => {
  it("nie używa cursor: wait, tylko cursor: not-allowed z zachowaną opacity", () => {
    const match = css.match(/button:disabled\s*{([^}]*)}/);
    expect(match).not.toBeNull();
    const rule = match?.[1] ?? "";
    expect(rule).toMatch(/cursor:\s*not-allowed/);
    expect(rule).not.toMatch(/cursor:\s*wait/);
    expect(rule).toMatch(/opacity:/);
  });
});
