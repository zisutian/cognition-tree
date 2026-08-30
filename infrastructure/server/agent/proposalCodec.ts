// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import type { AgentProposal } from "../../../application/agent/index.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  AgentProposalSchema,
  type AgentProposalDto,
} from "../../../contracts/agent/schemas.ts";

export function digestAgentProposal(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}

export function toAgentProposalDto(
  proposal: AgentProposal,
): AgentProposalDto {
  return parseAgentSchema(AgentProposalSchema, {
    baseRevision: proposal.base.revision,
    changes: proposal.changes,
    destructive: proposal.destructive,
    digest: proposal.digest,
    diff: proposal.diff,
    id: proposal.id,
    review: proposal.review,
    status: proposal.status,
    store: proposal.store,
    version: proposal.version,
  });
}
