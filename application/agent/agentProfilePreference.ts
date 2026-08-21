// SPDX-License-Identifier: GPL-3.0-or-later

export type AgentProfilePreferencePort = {
  clear(): void;
  load(): string | null;
  save(profileId: string): void;
};
