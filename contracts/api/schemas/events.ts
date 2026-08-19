// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiNonNegativeIntegerSchema,
  ApiResourceVersionSchema,
  ApiUuidSchema,
  nullable,
  strictObject,
} from "./foundation.ts";
import { ApiDomainChangeSetSchema } from "./transitions.ts";

export const ApiRevisionCheckpointSchema = strictObject({
  journal: nullable(ApiResourceVersionSchema),
  sequence: ApiNonNegativeIntegerSchema,
  streamId: ApiUuidSchema,
  todo: nullable(ApiResourceVersionSchema),
  workspaces: Type.Record(Type.String(), ApiResourceVersionSchema),
});
export type ApiRevisionCheckpointDto = Static<
  typeof ApiRevisionCheckpointSchema
>;

export const ApiChangeEventSchema = strictObject({
  changes: ApiDomainChangeSetSchema,
  checkpoint: ApiRevisionCheckpointSchema,
  sequence: ApiNonNegativeIntegerSchema,
  streamId: ApiUuidSchema,
  type: Type.Literal("change"),
});
export type ApiChangeEventDto = Static<typeof ApiChangeEventSchema>;

export const ApiCheckpointEventSchema = strictObject({
  checkpoint: ApiRevisionCheckpointSchema,
  sequence: ApiNonNegativeIntegerSchema,
  streamId: ApiUuidSchema,
  type: Type.Literal("checkpoint"),
});
export type ApiCheckpointEventDto = Static<
  typeof ApiCheckpointEventSchema
>;

export const ApiEventSchema = Type.Union([
  ApiCheckpointEventSchema,
  ApiChangeEventSchema,
]);
export type ApiEventDto = Static<typeof ApiEventSchema>;
