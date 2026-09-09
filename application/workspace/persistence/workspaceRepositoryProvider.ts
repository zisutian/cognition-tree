// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryDescriptor } from "../../repository/index.ts";
import type { WorkspaceRepository } from "./workspaceRepository.ts";

export type WorkspaceRepositoryProvider = {
  openRepository(
    descriptor: WorkspaceRepositoryDescriptor,
  ): WorkspaceRepository;
};
