import { describe, expect, it } from "vitest";
import {
  shouldVirtualizeUiRows,
  uiVirtualizationThreshold,
} from "../../../../presentation/ui/shared/virtualListMetrics";
describe("virtual list boundary", () => {
  it.each([
    [0, false],
    [uiVirtualizationThreshold, false],
    [uiVirtualizationThreshold + 1, true],
  ] as const)("virtualizes %i rows: %s", (count, expected) => {
    expect(shouldVirtualizeUiRows(count)).toBe(expected);
  });
});
