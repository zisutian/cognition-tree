// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalApplication } from "../../../application/journal/index.ts";
import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type { ActivityControllerProps } from "../../ui/index.ts";
import {
  BuiltInUnavailableActivity,
  resolveBuiltInActivityRetry,
} from "../unavailable/index.ts";
import { createJournalActivitySlots } from "./JournalActivitySlots.tsx";

type JournalBuiltInsApplication =
  ActivityControllerProps<JournalActivityApplication>["application"]["repository"]["builtIns"];

export function resolveJournalRetry(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  builtIns: JournalBuiltInsApplication,
) {
  return resolveBuiltInActivityRetry(journal, builtIns.catalog, "journal");
}

export function JournalActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: JournalActivityControllerProps) {
  const journal = application.journal;

  if (!active) {
    return null;
  }
  if (journal.status !== "ready") {
    return renderActivity(() => ({
      context: null,
      detail: null,
      main: {
        title: "日记",
        content: (
          <BuiltInUnavailableActivity
            application={journal}
            builtInId="journal"
            catalog={application.repository.builtIns.catalog}
            label="日记"
            onOpenRepository={() => onActiveActivityChange("repository")}
          />
        ),
      },
    }));
  }

  return renderActivity((controls) =>
    createJournalActivitySlots({
      focusMode: controls.focusMode,
      onToggleFocusMode: controls.onToggleFocusMode,
      view: journal.view,
    }),
  );
}

export type JournalActivityApplication = {
  journal: JournalApplication;
  repository: Pick<RepositoryApplication, "builtIns">;
};
export type JournalActivityControllerProps =
  ActivityControllerProps<JournalActivityApplication>;
