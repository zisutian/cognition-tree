// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";

const identifier = Type.String({ minLength: 1 });
const revision = Type.String({ pattern: "^sha256:[0-9a-f]{64}$" });
const timestamp = Type.String({ format: "ctn-canonical-timestamp" });

function strictObject<T extends Parameters<typeof Type.Object>[0]>(
  properties: T,
) {
  return Type.Object(properties, { additionalProperties: false });
}

export const DomainTextDiffHunkSchema = strictObject({
  from: Type.Integer({ minimum: 0 }),
  insertedText: Type.String(),
  resourceId: identifier,
  to: Type.Integer({ minimum: 0 }),
});
export type DomainTextDiffHunkDto = Static<typeof DomainTextDiffHunkSchema>;

export const DomainResourceChangeSchema = strictObject({
  domain: Type.Union([
    Type.Literal("journal"),
    Type.Literal("todo"),
    Type.Literal("workspace"),
  ]),
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("updated"),
  ]),
  repositoryId: Type.Optional(identifier),
  resourceId: identifier,
  version: Type.Optional(revision),
});
export type DomainResourceChangeDto = Static<
  typeof DomainResourceChangeSchema
>;

export const DomainBlockChangeSchema = strictObject({
  blockId: identifier,
  createdAt: Type.Optional(timestamp),
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("state-updated"),
    Type.Literal("updated"),
  ]),
  resourceId: identifier,
  updatedAt: timestamp,
});
export type DomainBlockChangeDto = Static<typeof DomainBlockChangeSchema>;

export const DomainChangeSetSchema = strictObject({
  blocks: Type.Array(DomainBlockChangeSchema),
  occurredAt: timestamp,
  resources: Type.Array(DomainResourceChangeSchema),
});
export type DomainChangeSetDto = Static<typeof DomainChangeSetSchema>;
