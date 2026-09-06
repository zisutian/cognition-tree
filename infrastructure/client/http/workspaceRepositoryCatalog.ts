// SPDX-License-Identifier: GPL-3.0-or-later

import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import {
  isRepositoryId,
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
  parseRenameRepository,
} from "../../../contracts/workspace/index.ts";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  type HttpApiTransportOptions,
} from "./apiTransport.ts";
import {
  requestWorkspaceApiJson,
  requestWorkspaceApiNoContent,
} from "./workspaceApiAdapter.ts";
import type { WorkspaceRepositoryCatalog } from "../../../application/repository/index.ts";
import type {
  WorkspaceRepositoryProvisioner,
} from "../../../application/workspace/index.ts";
import {
  type WorkspaceRepositoryPreparationPolicy,
} from "../../../application/workspace/index.ts";
import { parsePortableName } from "../../../core/naming/index.ts";

export function createHttpWorkspaceCatalogBackend({ baseUrl, fetch: fetchFn = globalThis.fetch.bind(globalThis), token, preparation }: HttpApiTransportOptions & { preparation: WorkspaceRepositoryPreparationPolicy }): WorkspaceRepositoryCatalog & WorkspaceRepositoryProvisioner {
  return {
    label: "HTTP 后端",
    async createRepository(input) {
      const decoded = parseCreateRepository(input);
      const outbound = {
        ...decoded,
        label: parsePortableName(decoded.label, "Repository label"),
      };

      preparation.prepare(outbound.content);
      const descriptor = parseRepositoryDescriptor(
        await requestWorkspaceApiJson(
          fetchFn,
          baseUrl,
          buildApiOperationPath("createAdminRepository"),
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );
      return descriptor;
    },
    async deleteRepository({ id }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      await requestWorkspaceApiNoContent(
        fetchFn,
        baseUrl,
        buildApiOperationPath("deleteAdminRepository", { repositoryId: id }),
        { method: "DELETE" },
        token,
      );

    },
    async listRepositories() {
      return parseRepositoryCatalog(await requestWorkspaceApiJson(fetchFn, baseUrl, buildApiOperationPath("listAdminRepositories"), undefined, token));
    },
    async renameRepository({ id, label }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      const decoded = parseRenameRepository({ label });
      const outbound = {
        label: parsePortableName(decoded.label, "Repository label"),
      };
      const descriptor = parseRepositoryDescriptor(
        await requestWorkspaceApiJson(
          fetchFn,
          baseUrl,
          buildApiOperationPath("renameAdminRepository", { repositoryId: id }),
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
          token,
        ),
      );

      return descriptor;
    },
  };
}
