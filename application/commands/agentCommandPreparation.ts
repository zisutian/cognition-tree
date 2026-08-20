// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedSnapshot,
} from "../persistence/versionedRepository.ts";

export type AgentPreparedCommand<
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

export type AgentCommandPreparation<
  Content,
  Projection,
  Outcome,
  Revision extends string,
  Intent,
> = (
  snapshot: PreparedVersionedSnapshot<Content, Projection, Revision>,
  intent: Intent,
) => AgentPreparedCommand<Content, Projection, Outcome, Revision>;
