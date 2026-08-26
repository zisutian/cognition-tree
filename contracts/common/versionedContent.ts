// SPDX-License-Identifier: GPL-3.0-or-later

export type ContentRevisionDto = `sha256:${string}`;

export type VersionedContentSnapshotDto<Content> = {
  content: Content;
  revision: ContentRevisionDto;
};

export type VersionedContentSyncRequestDto<Content> = {
  base: VersionedContentSnapshotDto<Content>;
  content: Content;
};

export type VersionedContentSyncResultDto<Content> = {
  outcome: "auto-merged" | "committed" | "unchanged";
  snapshot: VersionedContentSnapshotDto<Content>;
};
