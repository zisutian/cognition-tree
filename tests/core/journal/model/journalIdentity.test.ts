// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatJournalEntryTitle,
  getJournalCreationTimezoneOffsetMinutes,
} from "../../../../core/journal/model/journalIdentity";

describe("journal entry identity", () => {
  it("formats immutable titles with the creation-time ISO offset direction", () => {
    expect(
      formatJournalEntryTitle("2026-07-18T00:00:01.250Z", 480, 1),
    ).toBe("2026-07-18-0001");
    expect(
      formatJournalEntryTitle("2026-03-01T02:30:00.000Z", -300, 12),
    ).toBe("2026-02-28-0012");

    const date = new Date("2026-07-18T00:00:00.000Z");
    const original = date.getTimezoneOffset;

    date.getTimezoneOffset = () => -480;
    expect(getJournalCreationTimezoneOffsetMinutes(date)).toBe(480);
    date.getTimezoneOffset = original;
  });
});
