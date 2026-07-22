// SPDX-License-Identifier: GPL-3.0-or-later

export type ContentRevisionDto = `sha256:${string}`;

export type VersionedContentSnapshotDto<Content> = {
  content: Content;
  revision: ContentRevisionDto;
};

export type VersionedContentCommitDto<Content> = {
  baseRevision: ContentRevisionDto;
  content: Content;
};

export type VersionedContentCommitResultDto = {
  revision: ContentRevisionDto;
};
