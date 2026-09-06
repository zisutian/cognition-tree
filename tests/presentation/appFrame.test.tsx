// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { AppFrame } from "../../presentation/ui/AppFrame";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
  appProblemsMaxHeight,
  appProblemsMinHeight,
} from "../../presentation/ui/workbench/frameResize";
import { expectMarkupSemantics } from "./markupSemantics";

describe("AppFrame", () => {
  function renderFrame({
    context = true,
    detail = false,
    detailCollapsed = false,
    focusMode = false,
    problemsExpanded = false,
  } = {}) {
    return renderToStaticMarkup(
      <AppFrame activityItems={[]}
        activeActivityId="notes"
        contextSlot={context ? { content: <div>context</div>, title: "笔记" } : null}
        detailSlot={detail ? <section>detail</section> : null}
        layout={{
          contextCollapsed: false,
          contextResizeValue: appContextDefaultWidth,
          contextWidth: appContextDefaultWidth,
          detailCollapsed,
          detailResizeValue: appDetailDefaultWidth,
          detailWidth: appDetailDefaultWidth,
          focusMode,
          isContextResizing: false,
          isDetailResizing: false,
          isProblemsResizing: false,
          onContextResizeKeyDown: () => undefined,
          onContextResizeStart: () => undefined,
          onDetailResizeKeyDown: () => undefined,
          onDetailResizeStart: () => undefined,
          onDetailToggle: () => undefined,
          onProblemsResizeKeyDown: () => undefined,
          onProblemsResizeStart: () => undefined,
          problemsExpanded,
          problemsHeight: appProblemsDefaultHeight,
          problemsResizeValue: appProblemsDefaultHeight,
        }}
        mainSlot={<section>main</section>}
        onActivityChange={() => undefined}
        problemsSlot={<div>problems</div>}
        statusBarSlot={<footer>status</footer>}
      />,
    );
  }

  it.each([
    [
      "omits an empty context panel",
      { context: false },
      {
        has: ['aria-label="工作区功能"'],
        lacks: ['<aside aria-label="笔记"', "调整上下文区宽度"],
      },
    ],
    [
      "exposes context and detail resizing",
      { detail: true },
      {
        has: [
          "调整上下文区宽度", "调整右侧详情宽度",
          `aria-valuenow="${appContextDefaultWidth}"`,
          `aria-valuenow="${appDetailDefaultWidth}"`,
        ],
      },
    ],
    [
      "keeps the collapsed detail opener",
      { detail: true, detailCollapsed: true },
      { has: ["展开右侧详情"], lacks: ["detail</aside>"] },
    ],
    [
      "hides peripheral regions while retaining the Problems session",
      { detail: true, focusMode: true },
      {
        has: ['aria-label="工作区功能"', "main", 'aria-label="问题" hidden=""'],
        lacks: [">context<", ">detail<", "<footer>status"],
      },
    ],
    [
      "keeps collapsed Problems without a resize handle",
      {},
      {
        has: ['<aside aria-label="问题"', "problems"],
        lacks: ["调整问题面板高度"],
      },
    ],
    [
      "exposes Problems resizing only while expanded",
      { problemsExpanded: true },
      {
        has: [
          "调整问题面板高度",
          `aria-valuemin="${appProblemsMinHeight}"`,
          `aria-valuemax="${appProblemsMaxHeight}"`,
          `aria-valuenow="${appProblemsDefaultHeight}"`,
        ],
      },
    ],
  ] as const)("%s", (_name, options, semantics) => {
    expectMarkupSemantics(renderFrame(options), semantics);
  });
});
