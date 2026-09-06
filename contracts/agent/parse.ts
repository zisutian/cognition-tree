// SPDX-License-Identifier: GPL-3.0-or-later

import { inspectWireSchema } from "../common/schemaValidation.ts";
import type { Static, TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";


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
