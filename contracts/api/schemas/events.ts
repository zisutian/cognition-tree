// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiV1NonNegativeIntegerSchema,
  ApiV1ResourceVersionSchema,
  ApiV1UuidSchema,
  nullable,
  strictObject,
} from "./foundation.ts";
import { ApiV1DomainChangeSetSchema } from "./transitions.ts";

export const ApiV1RevisionCheckpointSchema = strictObject({
  journal: nullable(ApiV1ResourceVersionSchema),
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  todo: nullable(ApiV1ResourceVersionSchema),
  workspaces: Type.Record(Type.String(), ApiV1ResourceVersionSchema),
});
export type ApiV1RevisionCheckpointDto = Static<
  typeof ApiV1RevisionCheckpointSchema
>;

export const ApiV1ChangeEventSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  checkpoint: ApiV1RevisionCheckpointSchema,
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  type: Type.Literal("change"),
});
export type ApiV1ChangeEventDto = Static<typeof ApiV1ChangeEventSchema>;

export const ApiV1CheckpointEventSchema = strictObject({
  checkpoint: ApiV1RevisionCheckpointSchema,
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  type: Type.Literal("checkpoint"),
});
export type ApiV1CheckpointEventDto = Static<
  typeof ApiV1CheckpointEventSchema
>;

export const ApiV1EventSchema = Type.Union([
  ApiV1CheckpointEventSchema,
  ApiV1ChangeEventSchema,
]);
export type ApiV1EventDto = Static<typeof ApiV1EventSchema>;
