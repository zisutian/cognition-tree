// SPDX-License-Identifier: GPL-3.0-or-later

export type BuiltInId = "journal" | "todo";
export type BuiltInLocation = { serverPath: string; type: "server" };
export type BuiltInDescriptor = {
  id: BuiltInId;
  label: "日记" | "代办";
  location: BuiltInLocation;
  protected: true;
};
export type BuiltInIssue = {
  code:
    | "adapter_unavailable"
    | "repository_corrupt"
    | "unsupported_repository_version";
  id: BuiltInId;
  location: BuiltInLocation | null;
  message: string;
  status: "fault";
};
export type BuiltInCatalogData = {
  issues: BuiltInIssue[];
  repositories: BuiltInDescriptor[];
};
export type BuiltInRetryResult = { status: "fault" | "ready" };

export type BuiltInCatalog = {
  label: string;
  listBuiltIns(): Promise<BuiltInCatalogData>;
  retry(id: BuiltInId): Promise<BuiltInRetryResult>;
};
