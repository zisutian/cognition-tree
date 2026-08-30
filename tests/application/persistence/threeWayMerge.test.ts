// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  areMergeValuesEqual,
  mergeThreeWayValue,
} from "../../../application/persistence/threeWayMerge.ts";

describe("three-way merge value equality", () => {
  it("ignores object insertion order without ignoring array order", () => {
    const left = { nested: { first: 1, second: 2 }, values: [1, 2] };
    const right = { values: [1, 2], nested: { second: 2, first: 1 } };

    expect(areMergeValuesEqual(left, right)).toBe(true);
    expect(areMergeValuesEqual(left, { ...right, values: [2, 1] })).toBe(false);
  });

  it("does not report a conflict for structurally equal reordered values", () => {
    const local = { first: 1, second: 2 };
    const remote = { second: 2, first: 1 };

    expect(mergeThreeWayValue(
      "unit",
      { first: 0, second: 0 },
      local,
      remote,
    )).toEqual({
      conflict: null,
      value: local,
    });
  });
});
