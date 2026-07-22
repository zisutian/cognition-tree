// SPDX-License-Identifier: GPL-3.0-or-later

export type BuiltInIdDto = "journal" | "todo";

export type BuiltInLocationDto =
  | { serverPath: string; type: "server" }
  | { databaseName: string; type: "browser" };

export type BuiltInDescriptorDto = {
  id: BuiltInIdDto;
  label: "日记" | "代办";
  location: BuiltInLocationDto;
  protected: true;
};

export type BuiltInIssueDto = {
  code:
    | "adapter_unavailable"
    | "repository_corrupt"
    | "unsupported_repository_version";
  id: BuiltInIdDto;
  location: BuiltInLocationDto | null;
  message: string;
  status: "fault";
};

export type BuiltInCatalogDto = {
  issues: BuiltInIssueDto[];
  repositories: BuiltInDescriptorDto[];
};

export type BuiltInRetryResultDto = { status: "fault" | "ready" };
