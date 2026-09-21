// SPDX-License-Identifier: GPL-3.0-or-later

import { usePageDriver, describePage } from "../../navigation/index.ts";

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
  const entries =
    journal.status === "ready"
      ? journal.view.calendar.years.flatMap((y) =>
          y.months.flatMap((m) => m.entries),
        )
      : [];
  const page = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    return entry
      ? describePage("journal", "journal-entry", id, entry.title)
      : null;
  };
  usePageDriver("journal", {
    ready: journal.status === "ready",
    current: () =>
      journal.status === "ready" && journal.view.activeEntry
        ? page(journal.view.activeEntry.id)
        : describePage("journal", "activity", "journal", "日记"),
    describe: (target) =>
      target.kind === "journal-entry"
        ? page(target.id)
        : describePage("journal", "activity", "journal", "日记"),
    select: (target) => {
      const entry = entries.find((e) => e.id === target.id);
      if (target.kind === "journal-entry") {
        if (journal.status !== "ready" || !entry) return false;
        journal.view.selectEntry(entry.id);
      }
    },
  });

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
