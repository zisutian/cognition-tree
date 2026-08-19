// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export type ClientApiConfiguration = {
  baseUrl: string;
  token?: string;
};

const clientStartupConfigurationSchema = Type.Object({
  formatVersion: Type.Literal(1),
  apiBaseUrl: Type.String(),
  apiToken: Type.Optional(Type.String()),
}, {
  additionalProperties: false,
});

type ClientStartupConfiguration = Static<
  typeof clientStartupConfigurationSchema
>;

export const clientStartupConfigurationPath =
  "/cognition-tree.config.json";

export function parseClientApiBaseUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(
      "apiBaseUrl must be an absolute HTTP(S) origin.",
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "apiBaseUrl must be an absolute HTTP(S) origin.",
    );
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    (value !== url.origin && value !== `${url.origin}/`)
  ) {
    throw new Error(
      "apiBaseUrl must be a root HTTP(S) origin without credentials, query, or fragment.",
    );
  }

  return url.origin;
}

export function parseClientStartupConfiguration(
  value: unknown,
): ClientApiConfiguration {
  if (!Value.Check(clientStartupConfigurationSchema, value)) {
    throw new Error("The client startup configuration is invalid.");
  }

  const configuration: ClientStartupConfiguration = value;

  return {
    baseUrl: parseClientApiBaseUrl(configuration.apiBaseUrl),
    ...(configuration.apiToken === undefined || configuration.apiToken === ""
      ? {}
      : { token: configuration.apiToken }),
  };
}

export async function loadClientApiConfiguration(
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<ClientApiConfiguration> {
  const response = await fetcher(clientStartupConfigurationPath, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(
      `Could not load ${clientStartupConfigurationPath} (${response.status}).`,
    );
  }

  return parseClientStartupConfiguration(await response.json());
}
