// SPDX-License-Identifier: GPL-3.0-or-later

import { Maximize2, Minimize2 } from "lucide-react";
import type { TodoViewModel } from "../../../../application/todo";
import { CtnEditor } from "../../../editor/CtnEditor";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import {
  Button,
  EmptyState,
  Panel,
  PanelHeader,
} from "../../../ui/shared/primitives";

export function TodoEditorPanel({
  focusMode,
  onToggleFocusMode,
  view,
}: {
  focusMode: boolean;
  onToggleFocusMode: () => void;
  view: TodoViewModel;
}) {
  const feedback = useFeedback();

  if (!view.activeCollection) {
    return (
      <Panel aria-label="代办编辑" className="todo-editor-panel">
        <EmptyState
          action={(
            <Button
              onClick={() => view.createCollection("事项")}
              type="button"
              variant="primary"
            >
              新建事项集合
            </Button>
          )}
          description="创建集合后，使用代办符号逐行记录事项。"
          title="还没有事项集合"
        />
      </Panel>
    );
  }
  return (
    <Panel aria-label="代办编辑" className="todo-editor-panel">
      <PanelHeader
        actions={(
          <Button
            aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
            onClick={onToggleFocusMode}
            title={focusMode ? "退出专注模式" : "进入专注模式"}
            type="button"
            variant="icon"
          >
            {focusMode
              ? <Minimize2 aria-hidden="true" size={14} />
              : <Maximize2 aria-hidden="true" size={14} />}
          </Button>
        )}
        title={view.activeCollection.name}
      />
      <CtnEditor
        checkableBlocks={view.editor.checkableBlocks}
        contentMode={view.editor.contentMode}
        focusTarget={view.editor.focusTarget}
        key={view.activeCollection.id}
        syntax={view.editor.syntax}
        value={view.editor.documentText}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={(change) =>
          feedback.runAction(() => view.editor.updateBody(change))}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onToggleCheckableBlock={(blockId) => feedback.runAction(() =>
          view.toggleBlock(view.activeCollection!.id, blockId)
        )}
      />
    </Panel>
  );
}
