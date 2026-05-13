import { describe, expect, it } from "vitest";

import { applyFilter } from "./reviewFilter";

const items = [
  { id: 1, cleared: false },
  { id: 2, cleared: true },
  { id: 3, cleared: false },
  { id: 4, cleared: true },
];

describe("applyFilter", () => {
  it("returns only uncleared items for active", () => {
    expect(applyFilter(items, "active").map((i) => i.id)).toEqual([1, 3]);
  });

  it("returns only cleared items for cleared", () => {
    expect(applyFilter(items, "cleared").map((i) => i.id)).toEqual([2, 4]);
  });

  it("returns all items for all", () => {
    expect(applyFilter(items, "all")).toHaveLength(4);
  });
});
