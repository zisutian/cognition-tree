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
import { ChoiceGroup, SelectControl } from "../../ui/shared/controls";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import {
  ToolPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
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
    <div className="agent-scope-options">
      {options.length === 0 ? (
        <p>当前没有可选择的资源。</p>
      ) : (
        <ChoiceGroup
          ariaLabel={label}
          layout="wrap"
          mode="multiple"
          onChange={onChange}
          options={options.map(({ id, label: optionLabel }) => ({
            label: optionLabel,
            value: id,
          }))}
          values={selectedIds}
        />
      )}
    </div>
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
            <ToolPropertyList aria-label="新会话 Profile">
              <ToolPropertyRow
                label="Profile"
                value={preferredProfile?.label ?? "未选择"}
              />
              <ToolPropertyRow
                label="模型"
                value={preferredProfile?.model ?? "—"}
              />
              <ToolPropertyRow
                label="状态"
                value={(
                  <StatusBadge
                    tone={preferredProfile?.availability === "available"
                      ? "success"
                      : "warning"}
                  >
                    {preferredProfile?.availability === "available"
                      ? "可用"
                      : "需要在设置中完成配置"}
                  </StatusBadge>
                )}
              />
            </ToolPropertyList>
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
                    <ChoiceGroup
                      {...accessibility}
                      ariaLabel="领域"
                      mode="single"
                      onChange={(value: ScopeDomain) => setDomain(value)}
                      options={[
                        { label: "Workspace", value: "workspace" },
                        { label: "Journal", value: "journal" },
                        { label: "Todo", value: "todo" },
                      ]}
                      value={domain}
                    />
                  )}
                </FieldRow>
                {domain === "workspace" ? (
                  <>
                    <FieldRow
                      fieldId="agent-session-repository"
                      label="仓库"
                    >
                      {(accessibility) => (
                        <SelectControl
                          {...accessibility}
                          aria-label="仓库"
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
                        </SelectControl>
                      )}
                    </FieldRow>
                    <FieldRow fieldId="agent-session-workspace-scope" label="硬范围">
                      {(accessibility) => (
                        <ChoiceGroup
                          {...accessibility}
                          ariaLabel="硬范围"
                          mode="single"
                          onChange={(value: WorkspaceTargetKind) => setWorkspaceTargetKind(value)}
                          options={[
                            { label: "整个仓库", value: "repository" },
                            { disabled: !activeWorkspaceSelected, label: "文件夹及后代", value: "folder" },
                            { disabled: !activeWorkspaceSelected, label: "精确笔记", value: "note" },
                          ]}
                          value={workspaceTargetKind}
                        />
                      )}
                    </FieldRow>
                    {workspaceTargetKind === "folder" ? (
                      <FieldRow
                        fieldId="agent-session-folder"
                        label="文件夹"
                      >
                        {(accessibility) => (
                          <SelectControl
                            {...accessibility}
                            aria-label="文件夹"
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
                          </SelectControl>
                        )}
                      </FieldRow>
                    ) : null}
                    {workspaceTargetKind === "note" ? (
                      <FieldRow fieldId="agent-session-note" label="笔记">
                        {(accessibility) => (
                          <SelectControl
                            {...accessibility}
                            aria-label="笔记"
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
                          </SelectControl>
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
                        <ChoiceGroup
                          {...accessibility}
                          ariaLabel="硬范围"
                          mode="single"
                          onChange={(value) => setJournalAll(value === "all")}
                          options={[
                            { label: "全部日记", value: "all" },
                            { label: "精确日记", value: "selected" },
                          ]}
                          value={journalAll ? "all" : "selected"}
                        />
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
                        <ChoiceGroup
                          {...accessibility}
                          ariaLabel="硬范围"
                          mode="single"
                          onChange={(value) => setTodoAll(value === "all")}
                          options={[
                            { label: "全部集合", value: "all" },
                            { label: "精确集合", value: "selected" },
                          ]}
                          value={todoAll ? "all" : "selected"}
                        />
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
