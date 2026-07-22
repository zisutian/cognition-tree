// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalogDto,
  BuiltInRetryResultDto,
} from "../../../contracts/built-ins/types.ts";
import type { VersionedContentStore } from "../repository/versionedContentStore.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";
import type { WorkspaceApiRoute } from "./workspaceApiRoutes.ts";

export type BuiltInApiCatalog = {
  getStore(id: unknown): Promise<VersionedContentStore<unknown>>;
  listBuiltIns(): Promise<BuiltInCatalogDto>;
  retry(id: unknown): Promise<BuiltInRetryResultDto>;
};

export type BuiltInApiRoute = Extract<
  WorkspaceApiRoute,
  { kind: "built-ins" | "built-in-retry" | "built-in-snapshot" }
>;

export function isBuiltInApiRoute(
  route: WorkspaceApiRoute,
): route is BuiltInApiRoute {
  return route.kind === "built-ins" ||
    route.kind === "built-in-retry" ||
    route.kind === "built-in-snapshot";
}

export async function handleBuiltInApiRoute({
  builtInCatalog,
  method,
  readJsonBody,
  route,
}: {
  builtInCatalog: BuiltInApiCatalog | undefined;
  method: string;
  readJsonBody(): Promise<unknown>;
  route: BuiltInApiRoute;
}) {
  if (!builtInCatalog) {
    throw new WorkspaceApiRequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  if (route.kind === "built-ins") {
    return { body: await builtInCatalog.listBuiltIns(), statusCode: 200 };
  }
  if (route.kind === "built-in-retry") {
    return {
      body: await builtInCatalog.retry(route.id),
      statusCode: 200,
    };
  }
  const store = await builtInCatalog.getStore(route.id);

  return {
    body: method === "GET"
      ? await store.loadSnapshot()
      : await store.commitSnapshot(await readJsonBody()),
    statusCode: 200,
  };
}
