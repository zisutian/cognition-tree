// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  RepositoryAuthentication,
  WorkspaceRepositoryDescriptor,
} from "../../repository/workspaceRepositoryCatalog";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type ProvisionWorkspaceRepositoryInput =
  | {
      adapter: "local";
      content: WorkspaceRepositoryContent;
      label: string;
    }
  | {
      adapter: "webdav";
      authentication: RepositoryAuthentication;
      initialContent: WorkspaceRepositoryContent;
      label: string;
      url: string;
    };

export type WorkspaceRepositoryProvider = {
  openRepository(
    descriptor: WorkspaceRepositoryDescriptor,
  ): WorkspaceRepository;
};

export type WorkspaceRepositoryProvisioner = {
  createRepository(
    input: ProvisionWorkspaceRepositoryInput,
  ): Promise<WorkspaceRepositoryDescriptor>;
};
