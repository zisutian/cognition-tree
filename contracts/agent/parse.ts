// SPDX-License-Identifier: GPL-3.0-or-later

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { Static, TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";

const validators = new WeakMap<TSchema, ReturnType<typeof TypeCompiler.Compile>>();

export function parseAgentSchema<Schema extends TSchema>(
  schema: Schema,
  input: unknown,
): Static<Schema> {
  let validator = validators.get(schema);

  if (!validator) {
    validator = TypeCompiler.Compile(schema);
    validators.set(schema, validator);
  }
  if (!validator.Check(input)) {
    const issue = validator.Errors(input).First();
    failWireContract(
      "Cognition Tree Agent",
      issue?.path || "$",
      issue?.message ?? "invalid value",
    );
  }
  return input as Static<Schema>;
}
