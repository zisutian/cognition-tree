// SPDX-License-Identifier: GPL-3.0-or-later

import { isRepositoryId } from "../../../contracts/workspace-repository/parseCatalog.ts";
import type { WorkspaceRepositoryRegistration } from "../../repository/repositoryCatalog.ts";
import {
  createWebDavTransport,
  probeWebDavCapabilities,
} from "./webDavTransport.ts";
import { WebDavWorkspaceStore } from "./webDavWorkspaceStore.ts";

export type WebDavRepositoryConfig = {
  id: string;
  label: string;
  password?: string;
  url: string;
  username?: string;
};

const allowedFields = new Set(["id", "label", "password", "url", "username"]);

function readRequiredString(
  value: Record<string, unknown>,
  field: string,
  index: number,
) {
  const result = value[field];

  if (typeof result !== "string" || result.trim() === "") {
    throw new Error(
      `Invalid CTN_WEBDAV_REPOSITORIES[${index}].${field}`,
    );
  }

  return result;
}

function parseConfig(value: unknown, index: number): WebDavRepositoryConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid CTN_WEBDAV_REPOSITORIES[${index}]`);
  }

  const config = value as Record<string, unknown>;
  const unsupportedField = Object.keys(config).find(
    (field) => !allowedFields.has(field),
  );

  if (unsupportedField) {
    throw new Error(
      `Unsupported CTN_WEBDAV_REPOSITORIES[${index}].${unsupportedField}`,
    );
  }

  const id = readRequiredString(config, "id", index);
  const label = readRequiredString(config, "label", index);
  const urlValue = readRequiredString(config, "url", index);
  const username = config.username;
  const password = config.password;

  if (!isRepositoryId(id)) {
    throw new Error(`Invalid WebDAV repository id: ${id}`);
  }
  if (
    (username !== undefined && typeof username !== "string") ||
    (password !== undefined && typeof password !== "string") ||
    (username === undefined) !== (password === undefined)
  ) {
    throw new Error(
      `WebDAV credentials must be paired for repository: ${id}`,
    );
  }

  const url = new URL(urlValue);

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error(`Invalid WebDAV repository URL: ${id}`);
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;

  if (username !== undefined && url.protocol !== "https:") {
    throw new Error(`Authenticated WebDAV repository requires HTTPS: ${id}`);
  }

  return {
    id,
    label,
    ...(password === undefined ? {} : { password }),
    url: url.toString(),
    ...(username === undefined ? {} : { username }),
  };
}

export function parseWebDavRepositoryConfigs(source: string | undefined) {
  if (source === undefined || source.trim() === "") {
    return [];
  }

  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("CTN_WEBDAV_REPOSITORIES must be valid JSON");
  }

  if (!Array.isArray(value)) {
    throw new Error("CTN_WEBDAV_REPOSITORIES must be a JSON array");
  }

  const configs = value.map(parseConfig);
  const ids = new Set<string>();

  configs.forEach((config) => {
    if (ids.has(config.id)) {
      throw new Error(`Duplicate WebDAV repository id: ${config.id}`);
    }
    ids.add(config.id);
  });
  return configs;
}

export async function createWebDavRepositoryRegistrations(
  configs: WebDavRepositoryConfig[],
  { fetch: fetchFn }: { fetch?: typeof fetch } = {},
): Promise<WorkspaceRepositoryRegistration[]> {
  return Promise.all(configs.map(async (config) => {
    const transport = createWebDavTransport({
      fetch: fetchFn,
      password: config.password,
      url: config.url,
      username: config.username,
    });

    await probeWebDavCapabilities(transport);
    const store = new WebDavWorkspaceStore({
      initialWorkspaceId: config.id,
      initialWorkspaceName: config.label,
      transport,
    });

    await store.initialize();
    return {
      descriptor: {
        adapter: "webdav",
        id: config.id,
        label: config.label,
        locationLabel: `webdav:${config.id}`,
      },
      store,
    };
  }));
}
