import { WebDavRequestError, type WebDavTransport } from "../../../../server/adapters/webdav/webDavTransport.ts";

type Resource = { etag: string; source: string };

export class InMemoryWebDavTransport implements WebDavTransport {
  #directories = new Set<string>();
  #etag = 0;
  #resources = new Map<string, Resource>();

  async createCollection(relativePath: string) {
    this.#directories.add(relativePath);
  }

  async move(sourcePath: string, destinationPath: string) {
    const resource = this.#resources.get(sourcePath);

    if (!resource) {
      return false;
    }

    this.#resources.delete(sourcePath);
    this.#resources.set(destinationPath, {
      etag: this.#nextEtag(),
      source: resource.source,
    });
    return true;
  }

  async readText(relativePath: string) {
    const resource = this.#resources.get(relativePath);

    return resource ? { ...resource } : null;
  }

  async remove(
    relativePath: string,
    conditions: { ifMatch?: string } = {},
  ) {
    const resource = this.#resources.get(relativePath);

    if (resource) {
      if (conditions.ifMatch && conditions.ifMatch !== resource.etag) {
        throw new WebDavRequestError("DELETE", relativePath, 412);
      }

      this.#resources.delete(relativePath);
      return true;
    }

    const prefix = `${relativePath}/`;
    const resourcePaths = [...this.#resources.keys()].filter((path) =>
      path.startsWith(prefix),
    );
    const directoryPaths = [...this.#directories].filter(
      (path) => path === relativePath || path.startsWith(prefix),
    );

    resourcePaths.forEach((path) => this.#resources.delete(path));
    directoryPaths.forEach((path) => this.#directories.delete(path));
    return resourcePaths.length > 0 || directoryPaths.length > 0;
  }

  async writeText(
    relativePath: string,
    source: string,
    conditions: { ifMatch?: string; ifNoneMatch?: "*" } = {},
  ) {
    const current = this.#resources.get(relativePath);

    if (conditions.ifNoneMatch === "*" && current) {
      throw new WebDavRequestError("PUT", relativePath, 412);
    }
    if (conditions.ifMatch && current?.etag !== conditions.ifMatch) {
      throw new WebDavRequestError("PUT", relativePath, 412);
    }

    const etag = this.#nextEtag();

    this.#resources.set(relativePath, { etag, source });
    return etag;
  }

  has(relativePath: string) {
    return this.#resources.has(relativePath) ||
      this.#directories.has(relativePath);
  }

  listPaths() {
    return [
      ...this.#directories,
      ...this.#resources.keys(),
    ].sort();
  }

  #nextEtag() {
    this.#etag += 1;
    return `\"etag-${this.#etag}\"`;
  }
}
