// SPDX-License-Identifier: GPL-3.0-or-later

import { memo, useEffect, useLayoutEffect } from "react";
import type { ApplicationScheduler } from "../../../application/runtime/index.ts";
import type { ProblemCenterController } from "../../../application/problems/index.ts";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/index.ts";
import type { ActiveWorkspaceSession } from "../../../application/workspace/index.ts";
import type { ActivityId } from "../../ui/index.ts";
import {
  useWorkspaceApplication,
  type WorkspaceApplication,
} from "../../workspace/index.ts";

export type BoundWorkspaceApplication = {
  repositoryId: string;
  application: WorkspaceApplication;
};

/** Only this binding remounts with the workspace session. The workbench stays mounted.
 * Memoization prevents publishing its projection from rendering the producer again.
 */
export const WorkspaceApplicationBinding = memo(
  function WorkspaceApplicationBinding({
    scheduler,
    controller,
    feedbackController,
    onActiveActivityChange,
    repositoryId,
    session,
    snapshot,
    onChange,
  }: {
    scheduler: ApplicationScheduler;
    controller: WorkbenchController;
    feedbackController: ProblemCenterController<ActivityId>;
    onActiveActivityChange: (
      activityId: ActivityId,
      beforeChange?: () => boolean | void,
    ) => void;
    repositoryId: string;
    session: ActiveWorkspaceSession;
    snapshot: WorkbenchControllerSnapshot;
    onChange(value: BoundWorkspaceApplication | null): void;
  }) {
    const workspace = useWorkspaceApplication(session, scheduler);
    useLayoutEffect(() => {
      onChange({ repositoryId, application: workspace });
      return () => onChange(null);
    }, [onChange, repositoryId, workspace]);
    const focusRequest =
      snapshot.navigation.status === "ready" ? snapshot.navigation : null;

    useEffect(() => {
      if (!focusRequest) return;
      onActiveActivityChange("notes", () => {
        const found = workspace.navigation.openNoteBlock(
          focusRequest.destination.resourceId,
          focusRequest.destination.blockId,
        );

        if (!found) {
          feedbackController.reportInfo(
            "notes",
            "搜索结果中的块已不存在，已打开笔记首行。",
          );
        }
      });
      controller.consumeWorkspaceNoteDestination(focusRequest.requestId);
    }, [
      controller,
      feedbackController,
      focusRequest,
      onActiveActivityChange,
      workspace.navigation,
    ]);

    return null;
  },
);
