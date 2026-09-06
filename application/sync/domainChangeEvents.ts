// SPDX-License-Identifier: GPL-3.0-or-later



export type DomainRevisionCheckpoint<Revision extends string = string> = {
  journal: Revision | null;
  sequence: number;
  streamId: string;
  todo: Revision | null;
  workspaces: Readonly<Record<string, Revision>>;
};

export type DomainChangeNotification = {
  checkpoint: DomainRevisionCheckpoint;
  changedDomains: Readonly<{
    journal: boolean;
    todo: boolean;
    workspaceCatalog: boolean;
    workspaceRepositoryIds: readonly string[];
  }>;
  sequence: number;
  streamId: string;
};

export type DomainChangeEventSource = {
  dispose(): void;
  start(): void;
  subscribe(listener: (event: DomainChangeNotification) => void): () => void;
};
