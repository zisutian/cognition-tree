// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalDomainVersions } from "./journalDomainCommands.ts";

export function createJournalResourceVersions(
  digest: (value: unknown) => `sha256:${string}`,
): JournalDomainVersions {
  return {
    entry: (source) => digest({ source }),
    entries: (content) => digest(content.days.map(({
      date,
      entries,
      lastIssuedSequence,
    }) => ({
      date,
      entryIds: entries.map(({ id }) => id),
      lastIssuedSequence,
    }))),
  };
}
