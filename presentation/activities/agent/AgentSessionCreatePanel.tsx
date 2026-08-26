// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "react";
import type {
  AgentApplication,
  AgentScope,
  AgentScopeOption,
} from "../../../application/agent";
import {
  Button,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import {
  StatusBadge,
  StatusSummary,
} from "../../ui/shared/StatusPresentation";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";

type ScopeDomain = AgentScope["domain"];
type WorkspaceTargetKind = Extract<
  AgentScope,
  { domain: "workspace" }
>["target"]["kind"];

function ExactScopeOptions({
  label,
  onChange,
  options,
  selectedIds,
}: {
  label: string;
  onChange(ids: string[]): void;
  options: readonly AgentScopeOption[];
  selectedIds: readonly string[];
}) {
  return (
    <fieldset className="agent-scope-options">
      <legend>{label}</legend>
      {options.length === 0 ? (
        <p>当前没有可选择的资源。</p>
      ) : options.map((option) => (
        <label key={option.id}>
          <input
            checked={selectedIds.includes(option.id)}
            onChange={(event) => onChange(
              event.currentTarget.checked
                ? [...selectedIds, option.id]
                : selectedIds.filter((id) => id !== option.id),
            )}
            type="checkbox"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function AgentSessionCreatePanel({
  agent,
  onCreated,
}: {
  agent: AgentApplication;
  onCreated(): void;
}) {
  const feedback = useFeedback();
  const { controller, scopeCatalog, state } = agent;
  const [domain, setDomain] = useState<ScopeDomain>("workspace");
  const [repositoryId, setRepositoryId] = useState("");
  const [workspaceTargetKind, setWorkspaceTargetKind] =
    useState<WorkspaceTargetKind>("repository");
  const [folderId, setFolderId] = useState("");
  const [noteId, setNoteId] = useState("");
  const [journalAll, setJournalAll] = useState(true);
  const [journalEntryIds, setJournalEntryIds] = useState<string[]>([]);
  const [todoAll, setTodoAll] = useState(true);
  const [todoCollectionIds, setTodoCollectionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!scopeCatalog.repositoryOptions.some(({ id }) => id === repositoryId)) {
      setRepositoryId(
        scopeCatalog.activeWorkspace?.repositoryId ??
          scopeCatalog.repositoryOptions[0]?.id ??
          "",
      );
    }
  }, [repositoryId, scopeCatalog]);

  const activeWorkspaceSelected =
    scopeCatalog.activeWorkspace?.repositoryId === repositoryId;

  useEffect(() => {
    if (!activeWorkspaceSelected && workspaceTargetKind !== "repository") {
      setWorkspaceTargetKind("repository");
    }
  }, [activeWorkspaceSelected, workspaceTargetKind]);

  const scope = useMemo<AgentScope | null>(() => {
    if (domain === "workspace") {
      if (!repositoryId) return null;
      if (workspaceTargetKind === "folder") {
        return folderId
          ? {
              domain,
              repositoryId,
              target: { folderId, kind: "folder" },
            }
          : null;
      }
      if (workspaceTargetKind === "note") {
        return noteId
          ? { domain, repositoryId, target: { kind: "note", noteId } }
          : null;
      }
      return { domain, repositoryId, target: { kind: "repository" } };
    }
    if (domain === "journal") {
      return journalAll || journalEntryIds.length > 0
        ? { domain, entryIds: journalAll ? null : journalEntryIds }
        : null;
    }
    return todoAll || todoCollectionIds.length > 0
      ? { collectionIds: todoAll ? null : todoCollectionIds, domain }
      : null;
  }, [
    domain,
    folderId,
    journalAll,
    journalEntryIds,
    noteId,
    repositoryId,
    todoAll,
    todoCollectionIds,
    workspaceTargetKind,
  ]);
  const preferredProfile = state.status?.profiles.find(({ id }) =>
    id === state.preferredProfileId
  ) ?? null;
  const createSession = async () => {
    if (!scope) return;
    const created = await feedback.runAction(async () => {
      await controller.createSession({ scope });
      return true;
    });

    if (created) onCreated();
  };

  return (
    <ToolPanel
      aria-label="新建 Agent 会话"
      className="agent-session-create-panel"
      title="新建会话"
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          <ToolSection title="使用的 Profile">
            <StatusSummary
              ariaLabel="新会话 Profile"
              items={[
                {
                  label: "Profile",
                  value: preferredProfile?.label ?? "未选择",
                },
                { label: "模型", value: preferredProfile?.model ?? "—" },
                {
                  label: "状态",
                  value: (
                    <StatusBadge
                      tone={preferredProfile?.availability === "available"
                        ? "success"
                        : "warning"}
                    >
                      {preferredProfile?.availability === "available"
                        ? "可用"
                        : "需要在设置中完成配置"}
                    </StatusBadge>
                  ),
                },
              ]}
            />
          </ToolSection>
          <ToolSection title="硬范围">
            <form
              className="agent-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createSession();
              }}
            >
              <FormLayout>
                <FieldRow fieldId="agent-session-domain" label="领域">
                  {(accessibility) => (
                    <select
                      {...accessibility}
                      aria-label="领域"
                      className="ui-input"
                      onChange={(event) =>
                        setDomain(event.currentTarget.value as ScopeDomain)}
                      value={domain}
                    >
                      <option value="workspace">Workspace</option>
                      <option value="journal">Journal</option>
                      <option value="todo">Todo</option>
                    </select>
                  )}
                </FieldRow>
                {domain === "workspace" ? (
                  <>
                    <FieldRow
                      fieldId="agent-session-repository"
                      label="仓库"
                    >
                      {(accessibility) => (
                        <select
                          {...accessibility}
                          aria-label="仓库"
                          className="ui-input"
                          onChange={(event) =>
                            setRepositoryId(event.currentTarget.value)}
                          value={repositoryId}
                        >
                          <option value="">选择仓库</option>
                          {scopeCatalog.repositoryOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </FieldRow>
                    <FieldRow
                      description={!activeWorkspaceSelected
                        ? "只有当前已加载仓库可选择文件夹或精确笔记。"
                        : undefined}
                      fieldId="agent-session-workspace-scope"
                      label="硬范围"
                    >
                      {(accessibility) => (
                        <select
                          {...accessibility}
                          aria-label="硬范围"
                          className="ui-input"
                          onChange={(event) => setWorkspaceTargetKind(
                            event.currentTarget.value as WorkspaceTargetKind,
                          )}
                          value={workspaceTargetKind}
                        >
                          <option value="repository">整个仓库</option>
                          <option
                            disabled={!activeWorkspaceSelected}
                            value="folder"
                          >
                            文件夹及后代
                          </option>
                          <option
                            disabled={!activeWorkspaceSelected}
                            value="note"
                          >
                            精确笔记
                          </option>
                        </select>
                      )}
                    </FieldRow>
                    {workspaceTargetKind === "folder" ? (
                      <FieldRow
                        fieldId="agent-session-folder"
                        label="文件夹"
                      >
                        {(accessibility) => (
                          <select
                            {...accessibility}
                            aria-label="文件夹"
                            className="ui-input"
                            onChange={(event) =>
                              setFolderId(event.currentTarget.value)}
                            value={folderId}
                          >
                            <option value="">选择文件夹</option>
                            {scopeCatalog.activeWorkspace?.folderOptions.map(
                              (option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ),
                            )}
                          </select>
                        )}
                      </FieldRow>
                    ) : null}
                    {workspaceTargetKind === "note" ? (
                      <FieldRow fieldId="agent-session-note" label="笔记">
                        {(accessibility) => (
                          <select
                            {...accessibility}
                            aria-label="笔记"
                            className="ui-input"
                            onChange={(event) =>
                              setNoteId(event.currentTarget.value)}
                            value={noteId}
                          >
                            <option value="">选择笔记</option>
                            {scopeCatalog.activeWorkspace?.noteOptions.map(
                              (option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ),
                            )}
                          </select>
                        )}
                      </FieldRow>
                    ) : null}
                  </>
                ) : null}
                {domain === "journal" ? (
                  <>
                    <FieldRow
                      fieldId="agent-session-journal-scope"
                      label="硬范围"
                    >
                      {(accessibility) => (
                        <select
                          {...accessibility}
                          aria-label="硬范围"
                          className="ui-input"
                          onChange={(event) => setJournalAll(
                            event.currentTarget.value === "all",
                          )}
                          value={journalAll ? "all" : "selected"}
                        >
                          <option value="all">全部日记</option>
                          <option value="selected">精确日记</option>
                        </select>
                      )}
                    </FieldRow>
                    {!journalAll ? (
                      <ExactScopeOptions
                        label="允许的日记"
                        onChange={setJournalEntryIds}
                        options={scopeCatalog.journalEntryOptions}
                        selectedIds={journalEntryIds}
                      />
                    ) : null}
                  </>
                ) : null}
                {domain === "todo" ? (
                  <>
                    <FieldRow
                      fieldId="agent-session-todo-scope"
                      label="硬范围"
                    >
                      {(accessibility) => (
                        <select
                          {...accessibility}
                          aria-label="硬范围"
                          className="ui-input"
                          onChange={(event) => setTodoAll(
                            event.currentTarget.value === "all",
                          )}
                          value={todoAll ? "all" : "selected"}
                        >
                          <option value="all">全部集合</option>
                          <option value="selected">精确集合</option>
                        </select>
                      )}
                    </FieldRow>
                    {!todoAll ? (
                      <ExactScopeOptions
                        label="允许的集合"
                        onChange={setTodoCollectionIds}
                        options={scopeCatalog.todoCollectionOptions}
                        selectedIds={todoCollectionIds}
                      />
                    ) : null}
                  </>
                ) : null}
                <FormActions>
                  <Button
                    disabled={
                      !scope ||
                      preferredProfile?.availability !== "available" ||
                      state.operationStatus === "working" ||
                      state.status?.enabled !== true
                    }
                    type="submit"
                    variant="primary"
                  >
                    创建会话
                  </Button>
                </FormActions>
              </FormLayout>
            </form>
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
