// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  addTodoLocalDays,
} from "../../../../core/todo/recurrence/todoLocalDate";

describe("Todo local date", () => {
  it("uses deterministic Gregorian day arithmetic", () => {
    expect(addTodoLocalDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addTodoLocalDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addTodoLocalDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
