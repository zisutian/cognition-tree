import { describe, expect, it } from "vitest";
import {
  getListReorderIndex,
  getListRowDropPlacement,
} from "../../../presentation/ui/shared/listDrag";

describe("shared list drag", () => {
  it("uses the upper and lower row halves as list drop targets", () => {
    expect(getListRowDropPlacement({ offsetY: 2, rowHeight: 20 }))
      .toBe("before");
    expect(getListRowDropPlacement({ offsetY: 18, rowHeight: 20 }))
      .toBe("after");
  });

  it("resolves final indexes after removing the dragged row", () => {
    expect(getListReorderIndex({
      placement: "before",
      sourceIndex: 2,
      targetIndex: 0,
    })).toBe(0);
    expect(getListReorderIndex({
      placement: "after",
      sourceIndex: 0,
      targetIndex: 1,
    })).toBe(1);
    expect(getListReorderIndex({
      placement: "before",
      sourceIndex: 0,
      targetIndex: 2,
    })).toBe(1);
    expect(getListReorderIndex({
      placement: "after",
      sourceIndex: 0,
      targetIndex: 2,
    })).toBe(2);
  });
});
