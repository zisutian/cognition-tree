// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { schemaAs, strictObject } from "../common/index.ts";
import type { TodoRecurrenceRuleDto, TodoLocalDateDto } from "./types.ts";

export const TodoLocalDateSchema = schemaAs<TodoLocalDateDto>(
  Type.String({ format: "ctn-local-date" }),
);

export const TodoRecurrenceRuleSchema = schemaAs<TodoRecurrenceRuleDto>(
  Type.Union([
    strictObject({
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("daily"),
    }),
    strictObject({
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("weekly"),
      weekdays: Type.Array(Type.Integer({ maximum: 7, minimum: 1 }), {
        minItems: 1,
        uniqueItems: true,
      }),
    }),
    strictObject({
      dayOfMonth: Type.Integer({ maximum: 31, minimum: 1 }),
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("monthly"),
    }),
  ]),
);
