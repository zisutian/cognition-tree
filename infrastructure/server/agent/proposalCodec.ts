// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";

export function digestAgentProposal(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}
