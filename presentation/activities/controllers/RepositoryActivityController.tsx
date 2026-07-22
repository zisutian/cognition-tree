import { useEffect, useState } from "react";
import {
  createDefaultRepositorySelection,
  createRepositoryViewModel,
  projectRepositoryFocusSelection,
  repositorySelectionExists,
  type RepositorySelection,
} from "../../../application/workspace/activities/repository/repositoryViewModel";
import { createRepositoryActivitySlots } from "../views/repository/RepositoryActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

export function RepositoryActivityController({
  active,
  application,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const view = createRepositoryViewModel(application.repository);
  const [selection, setSelection] = useState<RepositorySelection>(() =>
    createDefaultRepositorySelection(view)
  );
  const [createdAfterRepositoryId, setCreatedAfterRepositoryId] = useState<
    string | null | undefined
  >(undefined);
  const activityView = {
    ...view,
    async createRepository(...input: Parameters<typeof view.createRepository>) {
      const previousActiveRepositoryId = view.activeRepositoryId;

      await view.createRepository(...input);
      setCreatedAfterRepositoryId(previousActiveRepositoryId);
    },
    async selectRepository(...input: Parameters<typeof view.selectRepository>) {
      await view.selectRepository(...input);
    },
  };

  useEffect(() => {
    if (!repositorySelectionExists(selection, view)) {
      setSelection(createDefaultRepositorySelection(view));
    }
  }, [
    selection,
    view.activeRepositoryId,
    view.issues,
    view.repositories,
  ]);

  useEffect(() => {
    if (
      createdAfterRepositoryId === undefined ||
      !view.activeRepositoryId ||
      view.activeRepositoryId === createdAfterRepositoryId
    ) {
      return;
    }
    setSelection({
      id: view.activeRepositoryId,
      kind: "ordinary-repository",
    });
    setCreatedAfterRepositoryId(undefined);
  }, [createdAfterRepositoryId, view.activeRepositoryId]);

  useEffect(() => {
    const request = application.repository.navigation.focusRequest;

    if (!request) return;
    setSelection(projectRepositoryFocusSelection(request));
  }, [application.repository.navigation.focusRequest]);

  return active
    ? renderActivity(() =>
        createRepositoryActivitySlots({
          focusRequest: application.repository.navigation.focusRequest,
          onConsumeFocusRequest:
            application.repository.navigation.consumeFocusRequest,
          onSelectionChange: setSelection,
          selection,
          view: activityView,
        }),
      )
    : null;
}
