// SPDX-License-Identifier: GPL-3.0-or-later

export {
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  ApiNonNegativeIntegerSchema,
  ApiResourceVersionSchema,
  ApiUuidSchema,
  nullable,
  schemaAs,
  strictObject,
} from "./schema.ts";
export {
  assertExactWireFields,
  failWireContract,
  parseContentRevision,
  readCanonicalTimestamp,
  readRequiredWireString,
  readWireArray,
  readWireObject,
  readWireString,
  UnsupportedWireVersionError,
  WireContractError,
} from "./contractValue.ts";
export type {
  ContentRevisionDto,
  VersionedContentSnapshotDto,
  VersionedContentSyncRequestDto,
  VersionedContentSyncResultDto,
} from "./versionedContent.ts";
export type {
  DomainBlockChangeDto,
  DomainChangeSetDto,
  DomainResourceChangeDto,
  DomainTextDiffHunkDto,
} from "./domainChanges.ts";
export {
  DomainChangeSetSchema,
  DomainTextDiffHunkSchema,
} from "./domainChanges.ts";
export {
  inspectWireSchema,
} from "./schemaValidation.ts";
export {
  serializeJsonIteratively,
} from "./json.ts";
