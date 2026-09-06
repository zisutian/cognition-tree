// SPDX-License-Identifier: GPL-3.0-or-later

import {
  inspectWireSchema,
  failWireContract,
} from "../common/index.ts";
import type { Static, TSchema } from "@sinclair/typebox";



export function parseAgentSchema<Schema extends TSchema>(
  schema: Schema,
  input: unknown,
): Static<Schema> {
  const issue = inspectWireSchema(schema, input);
  if (issue) {
    failWireContract(
      "Cognition Tree Agent",
      issue?.path || "$",
      issue?.message ?? "invalid value",
    );
  }
  return input as Static<Schema>;
}
