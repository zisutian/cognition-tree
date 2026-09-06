// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { WorkbenchApplication } from "./workbenchApplication";

export function projectUnavailableWorkspace(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
): WorkbenchApplication["workspace"] {
  if (snapshot.workspace.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.workspace.status === "failed") {
    return {
      errorMessage: snapshot.workspace.errorMessage,
      retry: controller.workspace.reload,
      status: "failed",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.catalog.state.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  if (snapshot.catalog.state.status === "failed") {
    return {
      errorMessage: snapshot.catalog.state.errorMessage,
      retry: controller.refreshRepositories,
      status: "failed",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  return { status: "absent" };
}
