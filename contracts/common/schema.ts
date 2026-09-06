// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type ObjectOptions, type TProperties, type TSchema, type TUnsafe } from "@sinclair/typebox";
import type { ContentRevisionDto } from "./versionedContent.ts";

export function strictObject<T extends TProperties>(
  properties: T,
  options: ObjectOptions = {},
) {
  return Type.Object(properties, {
    ...options,
    additionalProperties: false,
  });
}

export function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}

export function schemaAs<T>(schema: TSchema) {
  return schema as TUnsafe<T>;
}

export const ApiCanonicalTimestampSchema = Type.String({
  format: "ctn-canonical-timestamp",
});
export const ApiUuidSchema = Type.String({ format: "uuid" });
export const ApiResourceVersionSchema = schemaAs<ContentRevisionDto>(
  Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
);
export const ApiIdentifierSchema = Type.String({ minLength: 1 });
export const ApiNonNegativeIntegerSchema = Type.Integer({ minimum: 0 });
