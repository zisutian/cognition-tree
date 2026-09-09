// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import {
  ApiIdentifierSchema,
  nullable,
  schemaAs,
  strictObject,
} from "../common/index.ts";
import type { RepositoryDescriptorDto } from "./types.ts";
export const RepositoryLocationSchema = strictObject({
  hostPath: nullable(Type.String()),
  serverPath: Type.String(),
});
export const RepositoryDescriptorSchema = schemaAs<RepositoryDescriptorDto>(
  strictObject({
    id: ApiIdentifierSchema,
    label: Type.String(),
    labelIssue: nullable(
      Type.Union([
        Type.Literal("conflict"),
        Type.Literal("nonportable"),
        Type.Literal("reserved"),
      ]),
    ),
    location: RepositoryLocationSchema,
  }),
);
