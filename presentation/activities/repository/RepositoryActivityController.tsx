// SPDX-License-Identifier: GPL-3.0-or-later

import {
  usePageDriver,
  usePageNavigation,
  describePage,
} from "../../navigation/index.ts";
import { repositoryTargetKey } from "./RepositoryContext.tsx";
import { builtInLabel } from "./repositoryViewHelpers.ts";

import { useEffect, useState } from "react";
import type { RepositoryApplication } from "../../../application/repository/index.ts";
import {
  createDefaultRepositorySelection,
  createRepositoryViewModel,
  projectRepositoryFocusSelection,
  repositorySelectionExists,
  type RepositorySelection,
} from "../../../application/repository/index.ts";

import type { ActivityControllerProps } from "../../ui/index.ts";
import { createRepositoryActivitySlots } from "./RepositoryActivitySlots.tsx";

export function RepositoryActivityController({
  active,
  application,
  renderActivity,
}: RepositoryActivityControllerProps) {
  const view = createRepositoryViewModel(application.repository);
  const pages = usePageNavigation();
  const [selection, setSelection] = useState<RepositorySelection>(() =>
    createDefaultRepositorySelection(view),
  );
  const [pendingCreation, setPendingCreation] = useState<{
    previousRepositoryId: string | null;
    open: ReturnType<typeof pages.prepareOpen>;
  } | null>(null);
  const activityView = {
    ...view,
    async createRepository(...input: Parameters<typeof view.createRepository>) {
      const previousActiveRepositoryId = view.activeRepositoryId;
      const open = pages.prepareOpen("pinned");

      await view.createRepository(...input);
      setPendingCreation({
        previousRepositoryId: previousActiveRepositoryId,
        open,
      });
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
      !pendingCreation ||
      !view.activeRepositoryId ||
      view.activeRepositoryId === pendingCreation.previousRepositoryId
    ) {
      return;
    }
    const target: RepositorySelection = {
      id: view.activeRepositoryId,
      kind: "ordinary-repository",
    };
    pendingCreation.open(describe(target), () => setSelection(target));
    setPendingCreation(null);
  }, [pendingCreation, view.activeRepositoryId]);

  useEffect(() => {
    const request = application.repository.navigation.focusRequest;

    if (!request) return;
    setSelection(projectRepositoryFocusSelection(request));
  }, [application.repository.navigation.focusRequest]);

  const targets: RepositorySelection[] = [
    { kind: "create" },
    ...(["journal", "todo"] as const).map((id) => ({
      kind: "built-in" as const,
      id,
    })),
    ...view.repositories.map((item) => ({
      kind: "ordinary-repository" as const,
      id: item.id,
    })),
    ...view.issues.map((item) => ({
      kind: "ordinary-issue" as const,
      id: item.id,
    })),
  ];
  const describe = (value: RepositorySelection) =>
    describePage(
      "repository",
      "repository",
      repositoryTargetKey(value),
      value.kind === "create"
        ? "新建仓库"
        : value.kind === "built-in"
          ? builtInLabel(value.id)
          : value.kind === "ordinary-repository"
            ? (view.repositories.find((item) => item.id === value.id)?.label ??
              "仓库")
            : value.id,
    );
  usePageDriver("repository", {
    ready: view.catalogStatus === "ready",
    current: () => describe(selection),
    describe: (target) => {
      const value = targets.find(
        (item) => repositoryTargetKey(item) === target.id,
      );
      return value ? describe(value) : null;
    },
    select: (target) => {
      const value = targets.find(
        (item) => repositoryTargetKey(item) === target.id,
      );
      if (!value) return false;
      setSelection(value);
    },
  });
  return active
    ? renderActivity(() =>
        createRepositoryActivitySlots({
          onOpen: async (repositoryId) => {
            await pages.switchRepository(repositoryId, () =>
              view.selectRepository(repositoryId),
            );
          },
          focusRequest: application.repository.navigation.focusRequest,
          onConsumeFocusRequest:
            application.repository.navigation.consumeFocusRequest,
          onSelectionChange: (next, intent = "preview") => {
            pages.open(describe(next), intent, () => setSelection(next));
          },
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
