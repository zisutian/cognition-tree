// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryDescriptor } from
  "../../repository/index.ts";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "./workspaceRepository.ts";

export type ProvisionWorkspaceRepositoryInput = {
  content: WorkspaceRepositoryContent;
  label: string;
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
