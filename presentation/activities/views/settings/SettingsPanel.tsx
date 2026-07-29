import { KeyRound, PanelLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ApiAccessApplication,
  AutomationApiAuditEntry,
  AutomationApiScope,
  AutomationApiToken,
} from "../../../../application/apiAccess/apiAccessAdministration";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  cx,
} from "../../../ui/shared/primitives";

export type SettingsSection = "api-access" | "interface";

export type SettingsWorkbenchPreferences = {
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
};

const unavailableApiAccess: ApiAccessApplication = {
  reason: "浏览器本地存储不会暴露远程 API。请使用服务器存储模式。",
  status: "unavailable",
};

const settingsSections = [
  { icon: PanelLeft, id: "interface", label: "界面" },
  { icon: KeyRound, id: "api-access", label: "API 访问" },
] as const;

export function SettingsContext({
  onSectionChange = () => undefined,
  section = "interface",
}: {
  onSectionChange?: (section: SettingsSection) => void;
  section?: SettingsSection;
}) {
  return (
    <div className="activity-context-content settings-context">
      <ul className="ui-tree settings-list">
        {settingsSections.map(({ icon: Icon, id, label }) => {
          const selected = section === id;

          return (
            <li
              className={cx(
                "ui-tree-row-frame settings-row-frame",
                selected && "is-selected",
              )}
              key={id}
            >
              <button
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "ui-tree-row settings-row",
                  selected && "is-selected",
                )}
                onClick={() => onSectionChange(id)}
                type="button"
              >
                <Icon aria-hidden="true" size={13} />
                <span className="ui-tree-text">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InterfaceSettings({
  workbench,
}: {
  workbench: SettingsWorkbenchPreferences;
}) {
  return (
    <Panel aria-label="设置" className="settings-panel">
      <PanelHeader title="界面" />
      <PanelBody scroll>
        <div className="settings-content-column">
          <div className="settings-form-row">
            <label htmlFor="settings-context-width">左侧栏宽度</label>
            <input
              className="ui-input settings-width-input"
              id="settings-context-width"
              max={420}
              min={220}
              onChange={(event) => {
                const width = event.currentTarget.valueAsNumber;

                if (Number.isFinite(width)) {
                  workbench.onContextWidthChange(width);
                }
              }}
              step={1}
              type="number"
              value={workbench.contextWidth}
            />
            <span>px</span>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

type AutomationDomain = "journal" | "todo" | "workspace";
type PermissionLevel = "delete" | "none" | "read" | "write";

const automationDomains = [
  {
    id: "workspace",
    label: "Workspace",
    permissionLabel: "Workspace 权限",
  },
  { id: "journal", label: "日记", permissionLabel: "日记权限" },
  { id: "todo", label: "代办", permissionLabel: "代办权限" },
] as const satisfies ReadonlyArray<{
  id: AutomationDomain;
  label: string;
  permissionLabel: string;
}>;

const permissionLevels = [
  { label: "不授权", value: "none" },
  { label: "只读", value: "read" },
  { label: "读取和修改", value: "write" },
  { label: "读取、修改和删除", value: "delete" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: PermissionLevel;
}>;

const initialPermissions: Record<AutomationDomain, PermissionLevel> = {
  journal: "read",
  todo: "read",
  workspace: "read",
};

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用";
}

function permissionsToScopes(
  permissions: typeof initialPermissions,
): AutomationApiScope[] {
  return automationDomains.flatMap(({ id: domain }) => {
    const level = permissions[domain];

    if (level === "none") return [];
    return [
      `${domain}:read` as AutomationApiScope,
      ...(level === "write" || level === "delete"
        ? [`${domain}:write` as AutomationApiScope]
        : []),
      ...(level === "delete"
        ? [`${domain}:delete` as AutomationApiScope]
        : []),
    ];
  });
}

function formatTokenScopes(scopes: readonly AutomationApiScope[]) {
  return automationDomains.flatMap(({ id, label }) => {
    const level = scopes.includes(`${id}:delete`)
      ? "读写删除"
      : scopes.includes(`${id}:write`)
        ? "读写"
        : scopes.includes(`${id}:read`)
          ? "只读"
          : null;

    return level ? [`${label} ${level}`] : [];
  }).join(" · ");
}

function formatRepositoryScope(
  repositoryIds: string[] | null,
  repositories: ReadonlyArray<{ id: string; label: string }>,
) {
  if (repositoryIds === null) return "全部仓库";
  const labelById = new Map(
    repositories.map(({ id, label }) => [id, label]),
  );

  return repositoryIds
    .map((id) => labelById.get(id) ?? id)
    .join("、");
}

function TokenList({
  onRevoke,
  repositories,
  tokens,
}: {
  onRevoke(tokenId: string): void;
  repositories: ReadonlyArray<{ id: string; label: string }>;
  tokens: AutomationApiToken[];
}) {
  if (tokens.length === 0) {
    return <p className="settings-muted">尚未创建自动化令牌。</p>;
  }
  return (
    <ul className="settings-api-token-list" aria-label="自动化令牌">
      {tokens.map((token) => (
        <li key={token.id}>
          <div className="settings-api-token-name">
            <strong>{token.name}</strong>
            <code>{token.prefix}…</code>
          </div>
          <p>
            {formatTokenScopes(token.scopes)}
            {" · "}
            {formatRepositoryScope(token.repositoryIds, repositories)}
          </p>
          <p>
            {token.lastUsedAt
              ? `最近使用 ${formatTimestamp(token.lastUsedAt)}`
              : "尚未使用"}
          </p>
          <Button onClick={() => onRevoke(token.id)} type="button">
            撤销
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AuditList({ entries }: { entries: AutomationApiAuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="settings-muted">尚无自动化提交记录。</p>;
  }
  return (
    <div className="settings-api-table-wrap">
      <table className="settings-api-table" aria-label="最近 API 操作">
        <thead>
          <tr>
            <th>时间</th>
            <th>令牌</th>
            <th>命令</th>
            <th>目标</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.requestId}:${entry.commandId}`}>
              <td>{formatTimestamp(entry.occurredAt)}</td>
              <td><code>{entry.principalId}</code></td>
              <td>{entry.commandKind}</td>
              <td>
                资源 {entry.resourceIds.join(", ") || "—"}
                {entry.blockIds.length > 0
                  ? `；块 ${entry.blockIds.join(", ")}`
                  : ""}
              </td>
              <td>{entry.result === "committed" ? "已提交" : "失败"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiAccessSettings({
  apiAccess,
}: {
  apiAccess: ApiAccessApplication;
}) {
  const [audit, setAudit] = useState<AutomationApiAuditEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(apiAccess.status === "available");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState(initialPermissions);
  const [repositoryIds, setRepositoryIds] = useState<string[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [tokens, setTokens] = useState<AutomationApiToken[]>([]);
  const administration = apiAccess.status === "available"
    ? apiAccess.administration
    : null;
  const load = useCallback(async () => {
    if (!administration) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [nextTokens, nextAudit] = await Promise.all([
        administration.listTokens(),
        administration.listAudit(),
      ]);

      setTokens(nextTokens);
      setAudit(nextAudit.entries);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "无法加载 API 访问设置。",
      );
    } finally {
      setLoading(false);
    }
  }, [administration]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopes = useMemo(
    () => permissionsToScopes(permissions),
    [permissions],
  );
  if (apiAccess.status === "unavailable") {
    return (
      <Panel aria-label="API 访问" className="settings-panel">
        <PanelHeader title="API 访问" />
        <PanelBody scroll>
          <EmptyState
            description={apiAccess.reason}
            title="当前存储模式不提供 API"
          />
        </PanelBody>
      </Panel>
    );
  }
  const updatePermission = (
    domain: AutomationDomain,
    level: PermissionLevel,
  ) => {
    setPermissions((current) => ({
      ...current,
      [domain]: level,
    }));
  };
  const createToken = async () => {
    if (!administration || name.trim().length === 0 || scopes.length === 0) {
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const created = await administration.createToken({
        name: name.trim(),
        repositoryIds: permissions.workspace === "none"
          ? null
          : repositoryIds,
        scopes,
      });

      setSecret(created.secret);
      setName("");
      setTokens((current) => [
        created.token,
        ...current.filter(({ id }) => id !== created.token.id),
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "无法创建 API 令牌。",
      );
    } finally {
      setLoading(false);
    }
  };
  const revokeToken = async (tokenId: string) => {
    if (!administration) return;
    setErrorMessage(null);
    try {
      await administration.revokeToken(tokenId);
      setTokens((current) => current.filter(({ id }) => id !== tokenId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "无法撤销 API 令牌。",
      );
    }
  };

  return (
    <Panel aria-label="API 访问" className="settings-panel">
      <PanelHeader title="API 访问" />
      <PanelBody scroll>
        <div className="settings-content-column settings-api-content">
          {errorMessage
            ? <p className="settings-api-error" role="alert">{errorMessage}</p>
            : null}
          {secret
            ? (
              <section className="settings-api-secret" aria-live="polite">
                <strong>令牌仅显示这一次</strong>
                <code>{secret}</code>
                <Button onClick={() => setSecret(null)} type="button">
                  我已保存
                </Button>
              </section>
            )
            : null}
          <Section className="settings-api-section" title="创建令牌">
            <div className="settings-api-form">
              <label className="settings-api-form-row">
                <span>名称</span>
                <input
                  className="ui-input"
                  maxLength={80}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="例如：笔记整理工具"
                  value={name}
                />
              </label>
              <div className="settings-api-form-row">
                <span>领域权限</span>
                <table
                  aria-label="领域权限"
                  className="settings-api-permission-table"
                >
                  <tbody>
                    {automationDomains.map(({
                      id,
                      label,
                      permissionLabel,
                    }) => (
                      <tr key={id}>
                        <th scope="row">
                          <label htmlFor={`settings-api-${id}-permission`}>
                            {label}
                          </label>
                        </th>
                        <td>
                          <select
                            aria-label={permissionLabel}
                            className="ui-input"
                            id={`settings-api-${id}-permission`}
                            onChange={(event) =>
                              updatePermission(
                                id,
                                event.currentTarget.value as PermissionLevel,
                              )}
                            value={permissions[id]}
                          >
                            {permissionLevels.map((level) => (
                              <option key={level.value} value={level.value}>
                                {level.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {permissions.workspace === "none"
                ? null
                : (
                    <>
                      <label className="settings-api-form-row">
                        <span>仓库范围</span>
                        <select
                          className="ui-input"
                          onChange={(event) =>
                            setRepositoryIds(
                              event.currentTarget.value === "all" ? null : [],
                            )}
                          value={repositoryIds === null ? "all" : "selected"}
                        >
                          <option value="all">全部 Workspace 仓库</option>
                          <option
                            disabled={apiAccess.repositories.length === 0}
                            value="selected"
                          >
                            指定 Workspace 仓库
                          </option>
                        </select>
                      </label>
                      {repositoryIds === null
                        ? null
                        : (
                            <label className="settings-api-form-row">
                              <span>允许的仓库</span>
                              <select
                                aria-label="允许访问的 Workspace 仓库"
                                className="ui-input settings-api-repository-select"
                                multiple
                                onChange={(event) =>
                                  setRepositoryIds(
                                    Array.from(
                                      event.currentTarget.selectedOptions,
                                      ({ value }) => value,
                                    ),
                                  )}
                                size={Math.min(
                                  Math.max(apiAccess.repositories.length, 2),
                                  6,
                                )}
                                value={repositoryIds}
                              >
                                {apiAccess.repositories.map((repository) => (
                                  <option
                                    key={repository.id}
                                    value={repository.id}
                                  >
                                    {repository.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                    </>
                  )}
              <div className="settings-api-form-action">
                <Button
                  disabled={
                    loading ||
                    name.trim().length === 0 ||
                    scopes.length === 0 ||
                    (
                      permissions.workspace !== "none" &&
                      repositoryIds !== null &&
                      repositoryIds.length === 0
                    )
                  }
                  onClick={() => void createToken()}
                  type="button"
                  variant="primary"
                >
                  创建令牌
                </Button>
              </div>
            </div>
          </Section>
          <Section className="settings-api-section" title="现有令牌">
            {loading && tokens.length === 0
              ? <p className="settings-muted">正在加载…</p>
              : (
                  <TokenList
                    onRevoke={(id) => void revokeToken(id)}
                    repositories={apiAccess.repositories}
                    tokens={tokens}
                  />
                )}
          </Section>
          <Section className="settings-api-section" title="最近自动化操作">
            <AuditList entries={audit} />
          </Section>
          <Section className="settings-api-section" title="操作">
            <div className="settings-api-operation">
              <Button
                disabled={loading}
                onClick={() => void load()}
                type="button"
              >
                刷新
              </Button>
            </div>
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function SettingsPanel({
  apiAccess = unavailableApiAccess,
  section = "interface",
  workbench,
}: {
  apiAccess?: ApiAccessApplication;
  section?: SettingsSection;
  workbench: SettingsWorkbenchPreferences;
}) {
  return section === "api-access"
    ? <ApiAccessSettings apiAccess={apiAccess} />
    : <InterfaceSettings workbench={workbench} />;
}
