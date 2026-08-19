// SPDX-License-Identifier: GPL-3.0-or-later

export type WebDavTextResource = {
  etag: string | null;
  source: string;
};

export type WebDavCollectionEntry = {
  lastModified: number | null;
  path: string;
};

export type WebDavWriteConditions = {
  ifMatch?: string;
  ifNoneMatch?: "*";
};

export type WebDavCollectionCreationResult = "already-exists" | "created";

export type WebDavTransport = {
  createCollection: (
    relativePath: string,
  ) => Promise<WebDavCollectionCreationResult>;
  listCollection: (relativePath: string) => Promise<WebDavCollectionEntry[]>;
  readText: (relativePath: string) => Promise<WebDavTextResource | null>;
  remove: (
    relativePath: string,
    conditions?: Pick<WebDavWriteConditions, "ifMatch">,
  ) => Promise<boolean>;
  writeText: (
    relativePath: string,
    source: string,
    conditions?: WebDavWriteConditions,
  ) => Promise<string | null>;
};

export class WebDavRequestError extends Error {
  method: string;
  relativePath: string;
  statusCode: number;

  constructor(method: string, relativePath: string, statusCode: number) {
    super(`WebDAV ${method} ${relativePath} failed with ${statusCode}`);
    this.name = "WebDavRequestError";
    this.method = method;
    this.relativePath = relativePath;
    this.statusCode = statusCode;
  }
}

export class WebDavCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebDavCapabilityError";
  }
}
