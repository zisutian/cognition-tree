// SPDX-License-Identifier: GPL-3.0-or-later

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AgentApplication,
  AgentScope,
  AgentScopeOption,
} from "../../../application/agent";
import { Button, Section, cx } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

type ScopeDomain = AgentScope["domain"];
type WorkspaceTargetKind = Extract<
  AgentScope,
  { domain: "workspace" }
>["target"]["kind"];

function sessionScopeLabel(scope: AgentScope) {
  if (scope.domain === "workspace") {
    const target = scope.target.kind === "repository"
      ? "整个仓库"
      : scope.target.kind === "folder"
        ? `文件夹 ${scope.target.folderId}`
        : `笔记 ${scope.target.noteId}`;

    return `Workspace · ${target}`;
  }
  if (scope.domain === "journal") {
    return scope.entryIds === null
      ? "Journal · 全域"
      : `Journal · ${scope.entryIds.length} 篇日记`;
  }
  return scope.collectionIds === null
    ? "Todo · 全域"
    : `Todo · ${scope.collectionIds.length} 个集合`;
}

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

export function AgentContextPanel({ agent }: { agent: AgentApplication }) {
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
  const createSession = () => {
    if (!scope) return;
    void feedback.runAction(() => controller.createSession({ scope }));
  };
  const preferredProfile = state.status?.profiles.find(({ id }) =>
    id === state.preferredProfileId
  ) ?? null;

  return (
    <div className="activity-context-content agent-context">
      {state.loadStatus === "loading" ? (
        <p className="agent-muted">正在读取 Agent 状态…</p>
      ) : null}
      {state.loadStatus === "failed" ? (
        <p className="agent-error" role="alert">{state.errorMessage}</p>
      ) : null}
      <Section title="新会话">
        <div className="agent-create-form">
          <p className="agent-muted">
            默认 Profile：{preferredProfile?.label ?? "请先在设置中选择"}
          </p>
          <label>
            <span>领域</span>
            <select
              className="ui-input"
              onChange={(event) =>
                setDomain(event.currentTarget.value as ScopeDomain)}
              value={domain}
            >
              <option value="workspace">Workspace</option>
              <option value="journal">Journal</option>
              <option value="todo">Todo</option>
            </select>
          </label>
          {domain === "workspace" ? (
            <>
              <label>
                <span>仓库</span>
                <select
                  className="ui-input"
                  onChange={(event) => setRepositoryId(event.currentTarget.value)}
                  value={repositoryId}
                >
                  <option value="">选择仓库</option>
                  {scopeCatalog.repositoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>硬范围</span>
                <select
                  className="ui-input"
                  onChange={(event) => setWorkspaceTargetKind(
                    event.currentTarget.value as WorkspaceTargetKind,
                  )}
                  value={workspaceTargetKind}
                >
                  <option value="repository">整个仓库</option>
                  <option disabled={!activeWorkspaceSelected} value="folder">
                    文件夹及后代
                  </option>
                  <option disabled={!activeWorkspaceSelected} value="note">
                    精确笔记
                  </option>
                </select>
              </label>
              {!activeWorkspaceSelected ? (
                <p className="agent-muted">
                  只有当前已加载仓库可选择文件夹或精确笔记。
                </p>
              ) : null}
              {workspaceTargetKind === "folder" ? (
                <label>
                  <span>文件夹</span>
                  <select
                    className="ui-input"
                    onChange={(event) => setFolderId(event.currentTarget.value)}
                    value={folderId}
                  >
                    <option value="">选择文件夹</option>
                    {scopeCatalog.activeWorkspace?.folderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {workspaceTargetKind === "note" ? (
                <label>
                  <span>笔记</span>
                  <select
                    className="ui-input"
                    onChange={(event) => setNoteId(event.currentTarget.value)}
                    value={noteId}
                  >
                    <option value="">选择笔记</option>
                    {scopeCatalog.activeWorkspace?.noteOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          {domain === "journal" ? (
            <>
              <label>
                <span>硬范围</span>
                <select
                  className="ui-input"
                  onChange={(event) => setJournalAll(
                    event.currentTarget.value === "all",
                  )}
                  value={journalAll ? "all" : "selected"}
                >
                  <option value="all">全部日记</option>
                  <option value="selected">精确日记</option>
                </select>
              </label>
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
              <label>
                <span>硬范围</span>
                <select
                  className="ui-input"
                  onChange={(event) => setTodoAll(
                    event.currentTarget.value === "all",
                  )}
                  value={todoAll ? "all" : "selected"}
                >
                  <option value="all">全部集合</option>
                  <option value="selected">精确集合</option>
                </select>
              </label>
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
          <Button
            disabled={
              !scope ||
              preferredProfile?.availability !== "available" ||
              state.operationStatus === "working" ||
              state.status?.enabled !== true
            }
            onClick={createSession}
            type="button"
            variant="primary"
          >
            创建会话
          </Button>
        </div>
      </Section>
      <Section title="会话">
        {state.sessions.length === 0 ? (
          <p className="agent-muted">没有驻留中的 Agent 会话。</p>
        ) : (
          <ul className="agent-session-list">
            {state.sessions.map((session) => (
              <li
                className={cx(
                  session.id === state.activeSessionId && "is-active",
                )}
                key={session.id}
              >
                <button
                  aria-pressed={session.id === state.activeSessionId}
                  className="agent-session-select"
                  onClick={() => controller.selectSession(session.id)}
                  type="button"
                >
                  <strong>{session.profileId}</strong>
                  <span>{sessionScopeLabel(session.scope)}</span>
                  <span>{session.state}</span>
                </button>
                <Button
                  aria-label={`删除会话 ${session.id}`}
                  disabled={state.operationStatus === "working"}
                  onClick={() => void feedback.runAction(
                    () => controller.deleteSession(session.id),
                  )}
                  title="结束并删除内存会话"
                  type="button"
                  variant="icon"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
