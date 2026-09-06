// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryApplication } from "../../../application/repository/index.ts";
import { useEffect, useState } from "react";
import {
  createRepositoryViewModel,
  createDefaultRepositorySelection,
  projectRepositoryFocusSelection,
  repositorySelectionExists,
  type RepositorySelection,
} from "../../../application/repository/index.ts";

import { createRepositoryActivitySlots } from "./RepositoryActivitySlots.tsx";
import type { ActivityControllerProps } from "../../ui/index.ts";

export function RepositoryActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: RepositoryActivityControllerProps) {
  const view = createRepositoryViewModel(application.repository);
  const [selection, setSelection] = useState<RepositorySelection>(() =>
    createDefaultRepositorySelection(view),
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
  }, [selection, view.activeRepositoryId, view.issues, view.repositories]);

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
    ? renderActivity(({ onCollapseDetail }) =>
        createRepositoryActivitySlots({
          onOpen: async (repositoryId) => {
            let opening: Promise<void> | null = null;
            onActiveActivityChange("notes", () => {
              opening = view.selectRepository(repositoryId);
            });
            await opening;
          },
          focusRequest: application.repository.navigation.focusRequest,
          onCollapseDetail,
          onConsumeFocusRequest:
            application.repository.navigation.consumeFocusRequest,
          onSelectionChange: setSelection,
          selection,
          view: activityView,
        }),
      )
    : null;
}

export type RepositoryActivityApplication = {
  repository: RepositoryApplication;
};
export type RepositoryActivityControllerProps =
  ActivityControllerProps<RepositoryActivityApplication>;
