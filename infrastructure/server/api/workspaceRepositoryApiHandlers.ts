// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseCreateRepository,
  parseRepositoryDeletionMode,
  parseRenameRepository,
} from "../../../contracts/workspace/parseCatalog.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/repositoryCatalog.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";
import type { WorkspaceApiRoute } from "./workspaceApiRoutes.ts";

export type WorkspaceRepositoryApiRoute = Exclude<
  WorkspaceApiRoute,
  { kind: "built-ins" | "built-in-retry" | "built-in-snapshot" }
>;

export async function handleWorkspaceRepositoryApiRoute({
  catalog,
  method,
  readJsonBody,
  route,
  sensitiveLogValues,
  url,
}: {
  catalog: WorkspaceRepositoryCatalog;
  method: string;
  readJsonBody(): Promise<unknown>;
  route: WorkspaceRepositoryApiRoute;
  sensitiveLogValues: string[];
  url: URL;
}) {
  if (route.kind === "health") {
    return { body: { ok: true }, statusCode: 200 };
  }
  if (route.kind === "repositories") {
    if (method === "GET") {
      return { body: await catalog.listRepositories(), statusCode: 200 };
    }
    const body = parseCreateRepository(await readJsonBody());

    if (body.adapter === "webdav" && body.authentication.type === "basic") {
      sensitiveLogValues.push(body.authentication.password);
    }
    return {
      body: await catalog.createRepository(body),
      statusCode: 201,
    };
  }
  if (route.kind === "repository") {
    if (method === "PATCH") {
      if (url.search !== "") {
        throw new WorkspaceApiRequestError(
          "invalid_request",
          "Query parameters are not allowed for repository rename",
        );
      }
      return {
        body: await catalog.renameRepository(
          route.repositoryId,
          parseRenameRepository(await readJsonBody()),
        ),
        statusCode: 200,
      };
    }
    const keys = [...url.searchParams.keys()];
    const modes = url.searchParams.getAll("mode");

    if (keys.length !== 1 || keys[0] !== "mode" || modes.length !== 1) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "DELETE requires exactly one mode query parameter",
      );
    }
    const result = await catalog.deleteRepository(
      route.repositoryId,
      parseRepositoryDeletionMode(modes[0]),
    );

    return {
      body: result,
      statusCode: result.status === "deleting" ? 202 : 200,
    };
  }
  const store = await catalog.getStore(route.repositoryId);

  return {
    body: method === "GET"
      ? await store.loadSnapshot()
      : await store.commitSnapshot(await readJsonBody()),
    statusCode: 200,
  };
}
