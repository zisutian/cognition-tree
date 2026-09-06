import {
  AlertTriangle,
  Check,
  FileCode2,
  ListChecks,
  NotebookPen,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  SyntaxFileView,
  SyntaxViewModel,
} from "../../../application/syntax/index.ts";
import { syntaxFieldIds } from
  "../../../application/syntax/index.ts";
import {
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
  CompactContextStatusIcon,
  useFeedback,
  Button,
  useExclusiveAsyncAction,
} from "../../ui/index.ts";




export function SyntaxContext({ view }: { view: SyntaxViewModel }) {
  const feedback = useFeedback();
  const operationAction = useExclusiveAsyncAction();
  const busy = operationAction.busy;
  const [pendingDeleteFile, setPendingDeleteFile] =
    useState<SyntaxFileView | null>(null);
  const [renamingFile, setRenamingFile] = useState<{
    errorMessage?: string;
    id: string;
    value: string;
  } | null>(null);
  const [renameSubmittedFileId, setRenameSubmittedFileId] =
    useState<string | null>(null);
  const runOperation = async (operation: () => Promise<unknown>) => {
    const pending = operationAction.run(() =>
      feedback.runAction(async () => {
        await operation();
        return true;
      })
    );

    return pending ? await pending === true : false;
  };
  const mutationBlocked = busy || view.hasDraftErrors;

  useEffect(() => {
    const selectedFileId = view.selectedTarget.kind === "workspace-file"
      ? view.selectedTarget.fileId
      : null;

    if (renamingFile && renamingFile.id !== selectedFileId) {
      setRenamingFile(null);
      setRenameSubmittedFileId(null);
    }
    if (pendingDeleteFile && pendingDeleteFile.id !== selectedFileId) {
      setPendingDeleteFile(null);
    }
  }, [pendingDeleteFile, renamingFile, view.selectedTarget]);

  useEffect(() => {
    if (
      !renamingFile ||
      renameSubmittedFileId !== renamingFile.id ||
      view.draft?.name !== renamingFile.value
    ) {
      return;
    }
    setRenameSubmittedFileId(null);
    if (view.hasDraftErrors || view.nameConflictMessage) {
      setRenamingFile({
        ...renamingFile,
        errorMessage: view.nameConflictMessage || "语法名称无效，请修正后重试。",
      });
    } else {
      setRenamingFile(null);
    }
  }, [
    renameSubmittedFileId,
    renamingFile,
    view.draft?.name,
    view.hasDraftErrors,
    view.nameConflictMessage,
  ]);

  const beginRename = (file: SyntaxFileView) => {
    setPendingDeleteFile(null);
    setRenameSubmittedFileId(null);
    setRenamingFile({ id: file.id, value: file.name });
  };
  const submitRename = () => {
    const actions = view.actions;

    if (!renamingFile || !actions) return;
    if (!renamingFile.value.trim()) {
      setRenamingFile({
        ...renamingFile,
        errorMessage: "语法名称不能为空。",
      });
      feedback.notifyError(new Error("语法名称不能为空。"));
      return;
    }
    const file = view.files.find(({ id }) => id === renamingFile.id);

    if (file?.name === renamingFile.value) {
      setRenamingFile(null);
      return;
    }
    const updated = feedback.runAction(() => {
      actions.updateName(renamingFile.value);
      return true;
    });

    if (updated === true) {
      setRenameSubmittedFileId(renamingFile.id);
    } else {
      setRenamingFile({
        ...renamingFile,
        errorMessage: "重命名失败，请修正后重试。",
      });
    }
  };
  const confirmDelete = async () => {
    const file = pendingDeleteFile;

    if (!file) return;
    if (await runOperation(() => view.deleteFile(file.id))) {
      setPendingDeleteFile(null);
    }
  };

  return (
    <div className="activity-context-content syntax-context">
      <CompactContextList aria-label="系统语法">
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
      </CompactContextList>

      <div className="context-toolbar">
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
              actions={file.isSelected && renamingFile?.id !== file.id ? (
                <CompactContextActionButtons
                  actions={pendingDeleteFile?.id === file.id
                    ? undefined
                    : [
                        ...(!file.isActive
                          ? [{
                              ariaLabel: `启用语法 ${file.name}`,
                              disabled: mutationBlocked,
                              label: "用",
                              onSelect: () => void runOperation(
                                () => view.activateFile(file.id),
                              ),
                            }]
                          : []),
                        {
                          ariaLabel: `重命名语法 ${file.name}`,
                          disabled: busy || !view.actions,
                          label: "改",
                          onSelect: () => beginRename(file),
                        },
                        {
                          ariaLabel: `删除语法 ${file.name}`,
                          disabled: mutationBlocked,
                          label: "删",
                          onSelect: () => {
                            setRenamingFile(null);
                            setPendingDeleteFile(file);
                          },
                          tone: "danger" as const,
                        },
                      ]}
                  confirmation={pendingDeleteFile?.id === file.id
                    ? {
                        cancelAriaLabel: `取消删除语法 ${file.name}`,
                        confirmAriaLabel: `确认删除语法 ${file.name}`,
                        disabled: mutationBlocked,
                        onCancel: () => setPendingDeleteFile(null),
                        onConfirm: () => void confirmDelete(),
                      }
                    : undefined}
                />
              ) : undefined}
              buttonProps={{
                "data-syntax-file-id": file.id,
              }}
              className={[
                file.hasErrors ? "has-diagnostics" : "",
                pendingDeleteFile?.id === file.id ? "is-delete-pending" : "",
              ].filter(Boolean).join(" ") || undefined}
              disabled={switchingBlocked}
              icon={file.isActive ? (
                <CompactContextStatusIcon label="已启用语法">
                  <Check aria-hidden="true" size={13} strokeWidth={2.4} />
                </CompactContextStatusIcon>
              ) : <FileCode2 aria-hidden="true" size={13} />}
              inlineRename={renamingFile?.id === file.id
                ? {
                    ariaLabel: `重命名语法 ${file.name}`,
                    disabled: busy,
                    inputProps: {
                      "aria-invalid": renamingFile.errorMessage
                        ? true
                        : undefined,
                      "data-syntax-field-id": syntaxFieldIds.name,
                      maxLength: view.constraints.name.maxLength,
                      title: renamingFile.errorMessage,
                    },
                    onCancel: () => {
                      setRenamingFile(null);
                      setRenameSubmittedFileId(null);
                    },
                    onChange: (value) => {
                      setRenamingFile({ id: file.id, value });
                      setRenameSubmittedFileId(null);
                    },
                    onSubmit: submitRename,
                    value: renamingFile.value,
                  }
                : undefined}
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
              ) : null}
              onSelect={() => {
                setPendingDeleteFile(null);
                setRenamingFile(null);
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
    </div>
  );
}
