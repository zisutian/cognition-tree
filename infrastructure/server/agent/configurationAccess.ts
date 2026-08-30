// SPDX-License-Identifier: GPL-3.0-or-later

export class AgentConfigurationAccessConflictError extends Error {
  constructor(message = "Agent configuration is pinned by an active operation") {
    super(message);
    this.name = "AgentConfigurationAccessConflictError";
  }
}

export type AgentConfigurationProfileUse = Readonly<{
  bindProvider(providerId: string): void;
  release(): void;
}>;

export type AgentConfigurationProviderUse = Readonly<{
  release(): void;
}>;

export type AgentConfigurationProviderChange = Readonly<{
  release(): void;
}>;

type ProfileUseRecord = {
  providerId: string | null;
  released: boolean;
};

type ProviderUseRecord = {
  providerId: string;
  released: boolean;
};

type ProviderChangeRecord = {
  profileIds: ReadonlySet<string>;
  providerId: string;
  released: boolean;
};

function decrement(counts: Map<string, number>, key: string) {
  const next = (counts.get(key) ?? 0) - 1;

  if (next > 0) counts.set(key, next);
  else counts.delete(key);
}

export class AgentConfigurationAccess {
  readonly #profileUses = new Map<string, number>();
  readonly #profileUseRecords = new WeakMap<object, ProfileUseRecord>();
  readonly #providerChanges = new Map<string, ProviderChangeRecord>();
  readonly #providerChangeRecords = new WeakMap<object, ProviderChangeRecord>();
  readonly #providerUses = new Map<string, number>();
  readonly #providerUseRecords = new WeakMap<object, ProviderUseRecord>();

  beginProfileUse(profileId: string): AgentConfigurationProfileUse {
    if ([...this.#providerChanges.values()].some(({ profileIds }) =>
      profileIds.has(profileId)
    )) {
      throw new AgentConfigurationAccessConflictError(
        "Agent profile is pinned by a provider change",
      );
    }
    const record: ProfileUseRecord = { providerId: null, released: false };
    const lease: AgentConfigurationProfileUse = {
      bindProvider: (providerId: string) => {
        this.#bindProfileProvider(lease, profileId, providerId);
      },
      release: () => this.#releaseProfileUse(lease, profileId),
    };

    this.#profileUseRecords.set(lease, record);
    this.#profileUses.set(profileId, (this.#profileUses.get(profileId) ?? 0) + 1);
    return lease;
  }

  beginProviderUse(providerId: string): AgentConfigurationProviderUse {
    if (this.#providerChanges.has(providerId)) {
      throw new AgentConfigurationAccessConflictError(
        "Agent provider is pinned by a configuration change",
      );
    }
    const record: ProviderUseRecord = { providerId, released: false };
    const lease: AgentConfigurationProviderUse = {
      release: () => this.#releaseProviderUse(lease),
    };

    this.#providerUseRecords.set(lease, record);
    this.#providerUses.set(
      providerId,
      (this.#providerUses.get(providerId) ?? 0) + 1,
    );
    return lease;
  }

  beginProviderChange(
    providerId: string,
    profileIds: readonly string[],
  ): AgentConfigurationProviderChange {
    if (this.#providerChanges.has(providerId) ||
        (this.#providerUses.get(providerId) ?? 0) > 0 ||
        profileIds.some((profileId) =>
          (this.#profileUses.get(profileId) ?? 0) > 0
        )) {
      throw new AgentConfigurationAccessConflictError(
        "Agent provider is pinned by an active session or operation",
      );
    }
    const record: ProviderChangeRecord = {
      profileIds: new Set(profileIds),
      providerId,
      released: false,
    };
    const lease: AgentConfigurationProviderChange = {
      release: () => this.#releaseProviderChange(lease),
    };

    this.#providerChanges.set(providerId, record);
    this.#providerChangeRecords.set(lease, record);
    return lease;
  }

  assertProviderChange(
    lease: AgentConfigurationProviderChange,
    providerId: string,
  ) {
    const record = this.#providerChangeRecords.get(lease as object);

    if (!record || record.released || record.providerId !== providerId ||
        this.#providerChanges.get(providerId) !== record) {
      throw new AgentConfigurationAccessConflictError(
        "Agent provider change lease is no longer active",
      );
    }
  }

  assertProfileCanBeDeleted(profileId: string) {
    if ((this.#profileUses.get(profileId) ?? 0) > 0) {
      throw new AgentConfigurationAccessConflictError(
        "Agent profile is pinned by an active session or operation",
      );
    }
  }

  #bindProfileProvider(
    lease: AgentConfigurationProfileUse,
    profileId: string,
    providerId: string,
  ) {
    const record = this.#profileUseRecords.get(lease as object);

    if (!record || record.released) {
      throw new AgentConfigurationAccessConflictError(
        "Agent profile use lease is no longer active",
      );
    }
    if (record.providerId !== null) {
      if (record.providerId === providerId) return;
      throw new AgentConfigurationAccessConflictError(
        "Agent profile use cannot switch providers",
      );
    }
    if (this.#providerChanges.has(providerId)) {
      throw new AgentConfigurationAccessConflictError(
        "Agent provider is pinned by a configuration change",
      );
    }
    record.providerId = providerId;
    this.#providerUses.set(
      providerId,
      (this.#providerUses.get(providerId) ?? 0) + 1,
    );
    if ((this.#profileUses.get(profileId) ?? 0) < 1) {
      throw new Error("Agent profile use accounting is inconsistent");
    }
  }

  #releaseProfileUse(
    lease: AgentConfigurationProfileUse,
    profileId: string,
  ) {
    const record = this.#profileUseRecords.get(lease as object);

    if (!record || record.released) return;
    record.released = true;
    decrement(this.#profileUses, profileId);
    if (record.providerId !== null) decrement(this.#providerUses, record.providerId);
  }

  #releaseProviderUse(lease: AgentConfigurationProviderUse) {
    const record = this.#providerUseRecords.get(lease as object);

    if (!record || record.released) return;
    record.released = true;
    decrement(this.#providerUses, record.providerId);
  }

  #releaseProviderChange(lease: AgentConfigurationProviderChange) {
    const record = this.#providerChangeRecords.get(lease as object);

    if (!record || record.released) return;
    record.released = true;
    if (this.#providerChanges.get(record.providerId) === record) {
      this.#providerChanges.delete(record.providerId);
    }
  }
}
