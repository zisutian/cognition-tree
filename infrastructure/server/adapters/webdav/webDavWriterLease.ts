// SPDX-License-Identifier: GPL-3.0-or-later

import { RepositoryAdapterError } from "../../repository/repositoryStore.ts";
import {
  createWebDavLease,
  parseWebDavLease,
  requireWebDavEtag,
  stringifyWebDavControlFile,
  webDavLockPath,
  type WebDavLease,
} from "./webDavControlFiles.ts";
import {
  WebDavCapabilityError,
  WebDavRequestError,
  type WebDavTransport,
} from "./webDavTransport.ts";

export const defaultWebDavLockLeaseMs = 60_000;
export const defaultWebDavLockRenewMs = 20_000;

export type ActiveWebDavLease = {
  etag: string;
  lost: boolean;
  renewPromise: Promise<void>;
  stopped: boolean;
  timer: NodeJS.Timeout | null;
  value: WebDavLease;
};

type WebDavWriterLeaseCoordinatorOptions = {
  createId: () => string;
  leaseMs: number;
  now: () => number;
  renewMs: number;
  transport: WebDavTransport;
};

export class WebDavRepositoryBusyError extends RepositoryAdapterError {
  constructor() {
    super("repository_busy", "WebDAV repository is locked by another writer");
    this.name = "WebDavRepositoryBusyError";
  }
}

export class WebDavWriterLeaseCoordinator {
  readonly #createId: () => string;
  readonly #leaseMs: number;
  readonly #now: () => number;
  readonly #renewMs: number;
  readonly #transport: WebDavTransport;

  constructor({
    createId,
    leaseMs,
    now,
    renewMs,
    transport,
  }: WebDavWriterLeaseCoordinatorOptions) {
    this.#createId = createId;
    this.#leaseMs = leaseMs;
    this.#now = now;
    this.#renewMs = renewMs;
    this.#transport = transport;
  }

  async acquire(): Promise<ActiveWebDavLease> {
    const token = this.#createId();
    const value = this.#createValue(token);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const etag = await this.#transport.writeText(
          webDavLockPath,
          stringifyWebDavControlFile(value),
          { ifNoneMatch: "*" },
        );

        if (!etag) {
          throw new WebDavCapabilityError("WebDAV lease PUT returned no ETag");
        }
        const active: ActiveWebDavLease = {
          etag,
          lost: false,
          renewPromise: Promise.resolve(),
          stopped: false,
          timer: null,
          value,
        };

        this.#scheduleRenewal(active);
        return active;
      } catch (error) {
        if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
          throw error;
        }

        const existing = await this.#transport.readText(webDavLockPath);

        if (!existing) {
          continue;
        }
        const lease = parseWebDavLease(existing);

        if (Date.parse(lease.expiresAt) > this.#now()) {
          throw new WebDavRepositoryBusyError();
        }
        try {
          await this.#transport.remove(webDavLockPath, {
            ifMatch: requireWebDavEtag(existing, "writer lease"),
          });
        } catch (removeError) {
          if (
            removeError instanceof WebDavRequestError &&
            removeError.statusCode === 412
          ) {
            throw new WebDavRepositoryBusyError();
          }
          throw removeError;
        }
      }
    }

    throw new WebDavRepositoryBusyError();
  }

  async renew(lease: ActiveWebDavLease) {
    lease.renewPromise = lease.renewPromise.then(async () => {
      // release() may stop the timer after a renewal was queued. That is an
      // intentional shutdown, not a lease loss; release with the newest ETag.
      if (lease.stopped) {
        return;
      }
      if (lease.lost) {
        throw new WebDavRepositoryBusyError();
      }
      const value = this.#createValue(lease.value.token);

      try {
        const etag = await this.#transport.writeText(
          webDavLockPath,
          stringifyWebDavControlFile(value),
          { ifMatch: lease.etag },
        );

        if (!etag) {
          throw new WebDavCapabilityError("WebDAV lease renewal returned no ETag");
        }
        lease.etag = etag;
        lease.value = value;
      } catch {
        lease.lost = true;
        throw new WebDavRepositoryBusyError();
      }
    });
    return lease.renewPromise;
  }

  async assertHeld(lease: ActiveWebDavLease) {
    try {
      await lease.renewPromise;
      if (lease.lost || Date.parse(lease.value.expiresAt) <= this.#now()) {
        throw new WebDavRepositoryBusyError();
      }
      const resource = await this.#transport.readText(webDavLockPath);

      if (
        !resource ||
        requireWebDavEtag(resource, "writer lease") !== lease.etag ||
        parseWebDavLease(resource).token !== lease.value.token
      ) {
        throw new WebDavRepositoryBusyError();
      }
    } catch {
      lease.lost = true;
      throw new WebDavRepositoryBusyError();
    }
  }

  assertLocallyActive(lease: ActiveWebDavLease) {
    if (
      lease.stopped ||
      lease.lost ||
      Date.parse(lease.value.expiresAt) <= this.#now()
    ) {
      lease.lost = true;
      throw new WebDavRepositoryBusyError();
    }
  }

  async release(lease: ActiveWebDavLease) {
    lease.stopped = true;
    if (lease.timer) {
      clearTimeout(lease.timer);
      lease.timer = null;
    }
    await lease.renewPromise.catch(() => undefined);
    if (!lease.lost) {
      await this.#transport
        .remove(webDavLockPath, { ifMatch: lease.etag })
        .catch(() => false);
    }
  }

  #scheduleRenewal(lease: ActiveWebDavLease) {
    if (lease.stopped || lease.lost) {
      return;
    }
    lease.timer = setTimeout(() => {
      lease.timer = null;
      void this.renew(lease)
        .catch(() => {
          lease.lost = true;
        })
        .finally(() => this.#scheduleRenewal(lease));
    }, this.#renewMs);
    lease.timer.unref();
  }

  #createValue(token: string) {
    return createWebDavLease(token, this.#now() + this.#leaseMs);
  }
}
