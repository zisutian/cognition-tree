// SPDX-License-Identifier: GPL-3.0-or-later

import type { Static, TSchema } from "@sinclair/typebox";
import { parseApiSchema } from "../parse.ts";

export type ApiReadableDomain = "journal" | "todo" | "workspace";
export type ApiAccessPolicy =
  | { kind: "public" }
  | { kind: "owner" }
  | { domain: ApiReadableDomain | "any"; kind: "content-read" }
  | { kind: "content-sync" };

export type ApiBodyDefinition<Schema extends TSchema = TSchema> = {
  decode(input: unknown): Static<Schema>;
  schema: Schema;
};

export type ApiOperationDefinition = {
  access: ApiAccessPolicy;
  body?: ApiBodyDefinition;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  operationId: string;
  path: string;
  query?: TSchema;
  responseMediaType?: "application/json" | "text/event-stream";
  responses: Readonly<Record<number, TSchema | null>>;
};

export function apiBody<Schema extends TSchema>(
  schema: Schema,
  decode: (input: unknown) => Static<Schema> = (input) =>
    parseApiSchema(schema, input),
): ApiBodyDefinition<Schema> {
  return { decode, schema };
}

export const publicAccess = (): ApiAccessPolicy => ({ kind: "public" });
export const ownerAccess = (): ApiAccessPolicy => ({ kind: "owner" });
export const readableAccess = (
  domain: ApiReadableDomain | "any",
): ApiAccessPolicy => ({ domain, kind: "content-read" });
export const syncAccess = (): ApiAccessPolicy => ({ kind: "content-sync" });
