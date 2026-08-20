// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalParseIndex } from "../../core/journal/indexes/journalParseIndex.ts";
import type { JournalContent } from "../../core/journal/model/journalContent.ts";
import {
  projectJournalMutation,
  type JournalDomainVersions,
} from "./journalDomainCommands.ts";

export function projectJournalContentChanges(
  before: JournalContent,
  after: JournalContent,
  timestamp: string,
  beforeIndex: JournalParseIndex,
  afterIndex: JournalParseIndex,
  versionPolicy: JournalDomainVersions,
) {
  return projectJournalMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}
