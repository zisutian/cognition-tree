// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { JournalApplication } from "../../../application/journal";
import { createJournalActivitySlots } from "./JournalActivitySlots";
import type { ActivityControllerProps } from "../../ui/activityController";
import {
  BuiltInUnavailableActivity,
  resolveBuiltInActivityRetry,
} from "../unavailable/BuiltInUnavailableActivity";

type JournalBuiltInsApplication = ActivityControllerProps<JournalActivityApplication>[
  "application"
]["repository"]["builtIns"];

export function resolveJournalRetry(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  builtIns: JournalBuiltInsApplication,
) {
  return resolveBuiltInActivityRetry(
    journal,
    builtIns.catalog,
    "journal",
  );
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
      main: (
        <BuiltInUnavailableActivity
          application={journal}
          builtInId="journal"
          catalog={application.repository.builtIns.catalog}
          label="日记"
          onOpenRepository={() => onActiveActivityChange("repository")}
        />
      ),
    }));
  }

  return renderActivity((controls) =>
    createJournalActivitySlots({
      focusMode: controls.focusMode,
      onCollapseDetail: controls.onCollapseDetail,
      onToggleFocusMode: controls.onToggleFocusMode,
      view: journal.view,
    }),
  );
}

export type JournalActivityApplication = { journal: JournalApplication; repository: Pick<RepositoryApplication, "builtIns">; };
export type JournalActivityControllerProps = ActivityControllerProps<JournalActivityApplication>;
