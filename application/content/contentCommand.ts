// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnContentEdit } from "../../core/ctn/index.ts";
import type {
  TodoLocalDate,
  TodoRecurrenceRule,
} from "../../core/todo/index.ts";
import type { ContentOperationScope } from "../operations/index.ts";
import type { ContentReadBasis } from "./contentPorts.ts";

export type ContentCommand =
  | { kind: "create-repository"; name: string }
  | { kind: "rename-repository"; repository: string; name: string }
  | { kind: "delete-repository"; repository: string }
  | { kind: "create-folder"; parent: string | null; name: string }
  | { kind: "create-note"; parent: string | null; title: string; body: string }
  | {
      kind:
        | "delete-folder"
        | "delete-note"
        | "delete-entry"
        | "delete-collection";
      resource: string;
    }
  | {
      kind: "rename-folder" | "rename-note" | "rename-collection";
      resource: string;
      name: string;
    }
  | {
      kind: "move-tree-node";
      resource: string;
      resourceKind: "folder" | "note";
      parent: string | null;
      index: number;
    }
  | { kind: "edit-content"; resource: string; edit: CtnContentEdit }
  | {
      kind: "move-block";
      resource: string;
      blockId: string;
      targetResource: string;
      targetBlockId: string | null;
      position: "above" | "below" | "inside" | "end";
    }
  | { kind: "create-entry"; body: string }
  | { kind: "create-collection"; name: string; body: string }
  | { kind: "move-collection"; resource: string; index: number }
  | {
      kind: "set-completion";
      resource: string;
      blockId: string;
      completed: boolean;
      occurrenceDate: TodoLocalDate | null;
    }
  | {
      kind: "set-recurrence";
      resource: string;
      blockId: string;
      rule: TodoRecurrenceRule;
    }
  | { kind: "stop-recurrence"; resource: string; blockId: string }
  | { kind: "create-syntax"; source: string }
  | { kind: "update-syntax"; syntax: string | null; source: string }
  | { kind: "activate-syntax" | "delete-syntax"; syntax: string };

export type ContentOperationRequest = {
  basis: ContentReadBasis;
  command: ContentCommand;
  operationId: string;
  scope: ContentOperationScope;
};
