import {
  WebDavRequestError,
  type WebDavTransport,
} from "../../../../infrastructure/server/adapters/webdav/webDavTransport.ts";

type Resource = { etag: string; modifiedAt: number; source: string };

export class InMemoryWebDavTransport implements WebDavTransport {
  #directories = new Map<string, number>();
  #etag = 0;
  #now = Date.now();
  #resources = new Map<string, Resource>();
  activeWrites = 0;
  beforeList: ((path: string) => Promise<void> | void) | null = null;
  beforeRead: ((path: string) => Promise<void> | void) | null = null;
  beforeRemove: ((path: string) => Promise<void> | void) | null = null;
  beforeWrite: ((path: string) => Promise<void> | void) | null = null;
  maxActiveWrites = 0;

  async createCollection(relativePath: string) {
    const existed = this.#directories.has(relativePath);

    this.#directories.set(relativePath, this.#tick());
    return existed ? "already-exists" as const : "created" as const;
  }

  async listCollection(relativePath: string) {
    await this.beforeList?.(relativePath);
    const prefix = relativePath ? `${relativePath}/` : "";

    return [
      ...[...this.#directories].map(([path, lastModified]) => ({ path, lastModified })),
      ...[...this.#resources].map(([path, resource]) => ({
        lastModified: resource.modifiedAt,
        path,
      })),
    ].filter((entry) => entry.path.startsWith(prefix));
  }

  async readText(relativePath: string) {
    await this.beforeRead?.(relativePath);
    const resource = this.#resources.get(relativePath);
    return resource ? { etag: resource.etag, source: resource.source } : null;
  }

  async remove(relativePath: string, conditions: { ifMatch?: string } = {}) {
    await this.beforeRemove?.(relativePath);
    const resource = this.#resources.get(relativePath);

    if (resource) {
      if (conditions.ifMatch && conditions.ifMatch !== resource.etag) {
        throw new WebDavRequestError("DELETE", relativePath, 412);
      }
      this.#resources.delete(relativePath);
      return true;
    }

    const prefix = `${relativePath}/`;
    const resources = [...this.#resources.keys()].filter((path) => path.startsWith(prefix));
    const directories = [...this.#directories.keys()].filter(
      (path) => path === relativePath || path.startsWith(prefix),
    );

    resources.forEach((path) => this.#resources.delete(path));
    directories.forEach((path) => this.#directories.delete(path));
    return resources.length > 0 || directories.length > 0;
  }

  async writeText(
    relativePath: string,
    source: string,
    conditions: { ifMatch?: string; ifNoneMatch?: "*" } = {},
  ) {
    this.activeWrites += 1;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);

    try {
      await this.beforeWrite?.(relativePath);
      const current = this.#resources.get(relativePath);

      if (conditions.ifNoneMatch === "*" && current) {
        throw new WebDavRequestError("PUT", relativePath, 412);
      }
      if (conditions.ifMatch && current?.etag !== conditions.ifMatch) {
        throw new WebDavRequestError("PUT", relativePath, 412);
      }

      const etag = this.#nextEtag();

      this.#resources.set(relativePath, {
        etag,
        modifiedAt: this.#tick(),
        source,
      });
      return etag;
    } finally {
      this.activeWrites -= 1;
    }
  }

  has(relativePath: string) {
    return this.#resources.has(relativePath) || this.#directories.has(relativePath);
  }

  listPaths() {
    return [...this.#directories.keys(), ...this.#resources.keys()].sort();
  }

  source(relativePath: string) {
    return this.#resources.get(relativePath)?.source ?? null;
  }

  setModified(relativePath: string, modifiedAt: number) {
    const resource = this.#resources.get(relativePath);

    if (resource) {
      resource.modifiedAt = modifiedAt;
      return;
    }
    if (this.#directories.has(relativePath)) {
      this.#directories.set(relativePath, modifiedAt);
      return;
    }
    throw new Error(`Unknown WebDAV path: ${relativePath}`);
  }

  #nextEtag() {
    this.#etag += 1;
    return `\"etag-${this.#etag}\"`;
  }

  #tick() {
    this.#now += 1;
    return this.#now;
  }
}
