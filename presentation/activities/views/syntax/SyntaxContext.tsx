import {
  AlertTriangle,
  FileCode2,
  ListChecks,
  NotebookPen,
  Plus,
} from "lucide-react";
import { useState } from "react";
import type {
  SyntaxFileView,
  SyntaxViewModel,
} from "../../../../application/workspace/activities/syntax/syntaxViewModel";
import { ConfirmDialog } from "../../../ui/shared/ConfirmDialog";
import {
  CompactContextGroup,
  CompactContextList,
  CompactContextRow,
} from "../../../ui/shared/CompactContextList";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import { Button } from "../../../ui/shared/primitives";

export function SyntaxContext({ view }: { view: SyntaxViewModel }) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<SyntaxFileView | null>(null);
  const runOperation = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await feedback.runAction(operation);
    } finally {
      setBusy(false);
    }
  };
  const mutationBlocked = busy || view.hasDraftErrors;

  return (
    <div className="activity-context-content syntax-context">
      <CompactContextGroup
        headingId="syntax-system-heading"
        label="系统语法"
        listAriaLabel="系统语法"
      >
        {view.systemConfigurations.map((configuration) => (
          <CompactContextRow
            buttonProps={{
              "data-syntax-owner": configuration.owner,
            }}
            className={configuration.hasErrors ? "has-diagnostics" : undefined}
            disabled={busy || !configuration.available ||
              (view.hasDraftErrors && !configuration.isSelected)}
            icon={configuration.owner === "journal"
              ? <NotebookPen aria-hidden="true" size={13} />
              : <ListChecks aria-hidden="true" size={13} />}
            key={configuration.owner}
            label={configuration.label}
            selected={configuration.isSelected}
            title={configuration.available
              ? `${configuration.label}语法`
              : `${configuration.label}语法暂不可用`}
            trailing={configuration.hasErrors ? (
              <span className="ui-tree-meta syntax-file-error">
                <AlertTriangle aria-hidden="true" size={12} />
                错误
              </span>
            ) : null}
            onSelect={() => {
              void runOperation(() => view.selectTarget({
                kind: configuration.owner,
              }));
            }}
          />
        ))}
      </CompactContextGroup>

      <div className="syntax-workspace-group-header">
        <span>笔记库语法</span>
        <Button
          aria-label="新建笔记库语法"
          disabled={mutationBlocked || !view.workspaceAvailable}
          onClick={() => void runOperation(view.createFile)}
          title={view.hasDraftErrors
            ? "请先修复或撤销当前语法错误"
            : "新建笔记库语法"}
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      <CompactContextList
        aria-label="笔记库语法"
        className="syntax-workspace-group"
      >
        {view.files.map((file) => {
          const switchingBlocked = busy ||
            (view.hasDraftErrors && !file.isSelected);

          return (
            <CompactContextRow
              actions={file.isSelected ? (
                <>
                  {!file.isActive ? (
                    <button
                      aria-label={`启用语法 ${file.name}`}
                      disabled={mutationBlocked}
                      onClick={() => void runOperation(
                        () => view.activateFile(file.id),
                      )}
                      title={`启用语法 ${file.name}`}
                      type="button"
                    >
                      用
                    </button>
                  ) : null}
                  <button
                    aria-label={`删除语法 ${file.name}`}
                    disabled={mutationBlocked}
                    onClick={() => setPendingDeleteFile(file)}
                    title={view.hasDraftErrors
                      ? "请先修复或撤销当前语法错误"
                      : `删除语法 ${file.name}`}
                    type="button"
                  >
                    删
                  </button>
                </>
              ) : undefined}
              buttonProps={{
                "data-syntax-file-id": file.id,
              }}
              className={file.hasErrors ? "has-diagnostics" : undefined}
              disabled={switchingBlocked}
              icon={<FileCode2 aria-hidden="true" size={13} />}
              key={file.id}
              label={file.name}
              rowClassName="syntax-file-row"
              selected={file.isSelected}
              title={file.name}
              trailing={file.hasErrors ? (
                <span className="ui-tree-meta syntax-file-error">
                  <AlertTriangle aria-hidden="true" size={12} />
                  错误
                </span>
              ) : file.isActive ? (
                <span className="ui-tree-meta">启用</span>
              ) : null}
              onSelect={() => {
                void runOperation(() => view.selectTarget({
                  fileId: file.id,
                  kind: "workspace-file",
                }));
              }}
            />
          );
        })}
      </CompactContextList>
      {view.files.length === 0 ? (
        <p className="context-empty">当前笔记库没有语法文件。</p>
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
