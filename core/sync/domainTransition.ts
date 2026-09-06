// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnTextEdit } from "../ctn/index.ts";
import type { DomainChangeSet } from "./domainChangeSet.ts";

export type DomainTextEdit = CtnTextEdit & {
  resourceId: string;
};

export type DomainTransition<Content, Outcome> = {
  changes: DomainChangeSet;
  content: Content;
  diff: DomainTextEdit[];
  result: Outcome;
  warnings: readonly string[];
};
