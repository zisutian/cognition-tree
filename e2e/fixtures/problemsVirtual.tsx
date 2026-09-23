// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CompactProvider } from "compact-ui";
import "compact-ui/styles.css";
import type { UiWorkbenchOperationalProblem } from
  "../../application/workbench/index.ts";
import { uiConfig } from "../../presentation/ui/foundation/config.ts";
import {
  ProblemsPanel,
  initialProblemsFilters,
} from "../../presentation/ui/problems/ProblemsPanel.tsx";

const initialProblems: UiWorkbenchOperationalProblem[] = Array.from(
  { length: 520 },
  (_, index) => ({
    code: "unexpected_client_error",
    details: {},
    firstOccurredAt: "2026-09-23T00:00:00.000Z",
    id: `operation:problem-${index}`,
    lastOccurredAt: "2026-09-23T00:00:00.000Z",
    locationLabel: `很长的问题位置 ${index}`,
    message: `第 ${index} 条很长的错误说明`,
    occurrenceCount: 1,
    path: null,
    requestId: `request-${index}`,
    retryable: false,
    severity: "error",
    source: "ui-action",
    target: {
      kind: "operational-error",
      problemId: `problem-${index}`,
      sessionId: null,
      sourceScope: "notes",
    },
  }),
);

function VirtualProblemsFixture() {
  const [problems, setProblems] = useState(initialProblems);
  const [filters, setFilters] = useState(initialProblemsFilters);
  const [opened, setOpened] = useState<string[]>([]);
  const [copied, setCopied] = useState<string[]>([]);

  return (
    <CompactProvider config={uiConfig}>
      <div style={{ display: "flex", flexDirection: "column", height: 360, width: 140 }}>
        <ProblemsPanel
          expanded
          filters={filters}
          onFiltersChange={setFilters}
          onCopyRequestId={(id) => setCopied((items) => [...items, id])}
          onDismiss={(problem) => setProblems((items) =>
            items.filter(({ id }) => id !== problem.id)
          )}
          onOpen={(problem) => setOpened((items) => [...items, problem.id])}
          view={{
            errorCount: problems.length,
            problems,
            status: "ready",
            warningCount: 0,
          }}
        />
      </div>
      <output aria-label="验证事件" data-opened={opened.join(",")}
        data-copied={copied.join(",")} data-remaining={problems.length} />
    </CompactProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <VirtualProblemsFixture />,
);
