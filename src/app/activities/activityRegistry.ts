import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type { ActivityId } from "../../ui/activityTypes";
import type { WorkspaceActivityControllerProps } from "./activityController";

export type LazyActivityId = Exclude<ActivityId, "data" | "search">;

type LazyActivityController = LazyExoticComponent<
  ComponentType<WorkspaceActivityControllerProps>
>;

export const workspaceActivityControllers: ReadonlyArray<{
  activityId: LazyActivityId;
  Controller: LazyActivityController;
}> = [
  {
    activityId: "notes",
    Controller: lazy(async () => ({
      default: (await import("./NotesActivityController"))
        .NotesActivityController,
    })),
  },
  {
    activityId: "structure-operation",
    Controller: lazy(async () => ({
      default: (await import("./StructureOperationActivityController"))
        .StructureOperationActivityController,
    })),
  },
  {
    activityId: "visualization",
    Controller: lazy(async () => ({
      default: (await import("./VisualizationActivityController"))
        .VisualizationActivityController,
    })),
  },
  {
    activityId: "syntax",
    Controller: lazy(async () => ({
      default: (await import("./SyntaxActivityController"))
        .SyntaxActivityController,
    })),
  },
  {
    activityId: "repository",
    Controller: lazy(async () => ({
      default: (await import("./RepositoryActivityController"))
        .RepositoryActivityController,
    })),
  },
  {
    activityId: "settings",
    Controller: lazy(async () => ({
      default: (await import("./SettingsActivityController"))
        .SettingsActivityController,
    })),
  },
];

export function isLazyActivityId(
  activityId: ActivityId,
): activityId is LazyActivityId {
  return workspaceActivityControllers.some(
    (controller) => controller.activityId === activityId,
  );
}
