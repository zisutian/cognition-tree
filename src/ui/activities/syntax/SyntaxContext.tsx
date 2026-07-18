import { AlertTriangle, FileCode2, Plus } from "lucide-react";
import { useState } from "react";
import type {
  SyntaxFileView,
  SyntaxViewModel,
} from "../../../application/workspace/activities/syntax/syntaxViewModel";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import { useFeedback } from "../../shared/FeedbackProvider";
import { Button, cx } from "../../shared/primitives";

export function SyntaxContext({ view }: { view: SyntaxViewModel }) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<SyntaxFileView | null>(null);
  const runOperation = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await feedback.runAction(operation);
    } finally {
      setBusy(false);
    }
  };
  const catalogMutationBlocked = busy || view.hasDraftErrors;

  return (
    <div className="activity-context-content syntax-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建语法"
          disabled={catalogMutationBlocked}
          onClick={() => void runOperation(view.createFile)}
          title={view.hasDraftErrors
            ? "请先修复当前语法错误"
            : "新建语法"}
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      <ul className="ui-tree syntax-file-list">
        {view.files.map((file) => {
          const switchingBlocked = busy ||
            (view.hasDraftErrors && !file.isActive);
          const deletingBlocked = catalogMutationBlocked;

          return (
            <li
              className={cx(
                "ui-tree-row-frame syntax-file-row-frame",
                file.isActive && "is-selected",
                file.hasErrors && "has-diagnostics",
              )}
              key={file.id}
            >
              <button
                aria-current={file.isActive ? "page" : undefined}
                className={cx(
                  "ui-tree-row syntax-file-row",
                  file.isActive && "is-selected",
                )}
                data-syntax-file-id={file.id}
                disabled={switchingBlocked}
                onClick={() => {
                  if (!file.isActive) {
                    void runOperation(() => view.selectFile(file.id));
                  }
                }}
                title={file.name}
                type="button"
              >
                <FileCode2 aria-hidden="true" size={13} />
                <span className="ui-tree-text">{file.name}</span>
                {file.hasErrors ? (
                  <span className="ui-tree-meta syntax-file-error">
                    <AlertTriangle aria-hidden="true" size={12} />
                    错误
                  </span>
                ) : file.isActive ? (
                  <span className="ui-tree-meta">启用</span>
                ) : null}
              </button>
              <span className="ui-tree-actions">
                <button
                  aria-label={`删除语法 ${file.name}`}
                  disabled={deletingBlocked}
                  onClick={() => setPendingDeleteFile(file)}
                  title={deletingBlocked && view.hasDraftErrors
                    ? "请先修复当前语法错误"
                    : `删除语法 ${file.name}`}
                  type="button"
                >
                  删
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {view.files.length === 0 ? (
        <p className="context-empty">没有语法文件。</p>
      ) : null}
      <ConfirmDialog
        confirmLabel="删除语法"
        description={pendingDeleteFile
          ? `确定删除语法“${pendingDeleteFile.name}”？此操作不可撤销。`
          : ""}
        open={pendingDeleteFile !== null}
        title="删除语法"
        onCancel={() => setPendingDeleteFile(null)}
        onConfirm={() => {
          const file = pendingDeleteFile;

          if (!file) {
            return;
          }
          setPendingDeleteFile(null);
          void runOperation(() => view.deleteFile(file.id));
        }}
      />
    </div>
  );
}
