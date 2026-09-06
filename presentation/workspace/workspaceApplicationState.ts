// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceApplication } from "./runtime/useWorkspaceApplication.ts";

export type WorkbenchWorkspaceState =
  | { status: "absent" }
  | { status: "loading"; storageLabel: string }
  | {
      errorMessage: string;
      retry: () => Promise<void>;
      status: "failed";
      storageLabel: string;
    }
  | { application: WorkspaceApplication; status: "ready" };
