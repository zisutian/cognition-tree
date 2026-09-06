// SPDX-License-Identifier: GPL-3.0-or-later

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { TSchema } from "@sinclair/typebox";
import { initializeContractFormats } from "./formats.ts";

const validators = new WeakMap<TSchema, ReturnType<typeof TypeCompiler.Compile>>();

export function inspectWireSchema(schema: TSchema, input: unknown) {
  initializeContractFormats();
  let validator = validators.get(schema);
  if (!validator) {
    validator = TypeCompiler.Compile(schema);
    validators.set(schema, validator);
  }
  return validator.Check(input) ? null : validator.Errors(input).First() ?? {
    path: "$",
    message: "invalid value",
  };
}
