// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo/index.ts";
import { CtnEditor, CtnEditorPanel } from "../../editor/index.ts";

import { Button, EmptyState, Page, useFeedback } from "../../ui/index.ts";

export function TodoEditorPanel({
  creation,
  view,
}: {
  creation: { disabled: boolean; begin(): void };
  view: TodoViewModel;
}) {
  const feedback = useFeedback();

  const activeCollection = view.activeCollection;

  if (!activeCollection) {
    return (
      <Page aria-label="代办编辑" kind="editor">
        <EmptyState
          action={
            <Button
              disabled={creation.disabled}
              onClick={creation.begin}
              type="button"
              variant="primary"
            >
              新建事项集合
            </Button>
          }
          title="还没有事项集合"
        />
      </Page>
    );
  }
  return (
    <CtnEditorPanel ariaLabel="代办编辑">
      <CtnEditor
        checkableBlocks={view.editor.checkableBlocks}
        contentMode={view.editor.contentMode}
        focusTarget={view.editor.focusTarget}
        key={activeCollection.id}
        syntax={view.editor.syntax}
        value={view.editor.documentText}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={(change) =>
          feedback.runAction(() => view.editor.updateBody(change))
        }
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onToggleCheckableBlock={(blockId) =>
          feedback.runAction(() =>
            view.toggleBlock(activeCollection.id, blockId),
          )
        }
        readOnly={view.editor.readOnly}
      />
    </CtnEditorPanel>
  );
}
