// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedSnapshot,
} from "../persistence/index.ts";

export type PreparedContentCommand<
  Content,
  Projection,
  Outcome,
  Revision extends string,
> = Readonly<{
  baseRevision: Revision;
  content: Content;
  destructive: boolean;
  outcome: Outcome;
  projection: Projection;
  timestamp: string;
}>;

export type ContentCommandPreparation<
  Content,
  Projection,
  Outcome,
  Revision extends string,
  Intent,
> = (
  snapshot: PreparedVersionedSnapshot<Content, Projection, Revision>,
  intent: Intent,
) => PreparedContentCommand<Content, Projection, Outcome, Revision>;
