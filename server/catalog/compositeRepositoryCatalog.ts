// SPDX-License-Identifier: GPL-3.0-or-later

import type { CreateRepositoryDto } from "../../contracts/workspace-repository/types.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
  type WorkspaceRepositoryRegistration,
} from "../repository/repositoryCatalog.ts";

type MutableWorkspaceRepositoryCatalog = WorkspaceRepositoryCatalog & {
  initialize: () => Promise<void>;
};

export class CompositeRepositoryCatalog implements WorkspaceRepositoryCatalog {
  #localCatalog: MutableWorkspaceRepositoryCatalog;
  #registrations: Map<string, WorkspaceRepositoryRegistration>;

  constructor(
    localCatalog: MutableWorkspaceRepositoryCatalog,
    registrations: WorkspaceRepositoryRegistration[] = [],
  ) {
    this.#localCatalog = localCatalog;
    this.#registrations = new Map();

    registrations.forEach((registration) => {
      if (this.#registrations.has(registration.descriptor.id)) {
        throw new RepositoryCatalogError(
          500,
          `Duplicate configured repository id: ${registration.descriptor.id}`,
        );
      }

      this.#registrations.set(registration.descriptor.id, registration);
    });
  }

  async initialize() {
    await this.#localCatalog.initialize();
    const localRepositories = await this.#localCatalog.listRepositories();

    localRepositories.repositories.forEach((descriptor) => {
      if (this.#registrations.has(descriptor.id)) {
        throw new RepositoryCatalogError(
          500,
          `Configured repository id collides with local repository: ${descriptor.id}`,
        );
      }
    });
  }

  async createRepository(request: CreateRepositoryDto) {
    if (this.#registrations.has(request.id)) {
      throw new RepositoryCatalogError(
        409,
        `Repository already exists: ${request.id}`,
      );
    }

    return this.#localCatalog.createRepository(request);
  }

  async getStore(repositoryId: string) {
    const registration = this.#registrations.get(repositoryId);

    return registration?.store ?? this.#localCatalog.getStore(repositoryId);
  }

  async listRepositories() {
    const localCatalog = await this.#localCatalog.listRepositories();

    return {
      repositories: [
        ...localCatalog.repositories,
        ...[...this.#registrations.values()].map(
          (registration) => registration.descriptor,
        ),
      ].sort((left, right) => left.id.localeCompare(right.id)),
    };
  }
}
