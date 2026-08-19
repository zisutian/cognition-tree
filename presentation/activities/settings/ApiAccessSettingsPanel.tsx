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
} from "../../../application/apiAccess/apiAccessAdministration";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../ui/shared/primitives";
import {
  ApiAccessAudit,
  formatApiAccessTimestamp,
} from "./ApiAccessAudit";

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
              ? `最近使用 ${formatApiAccessTimestamp(token.lastUsedAt)}`
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

export function ApiAccessSettingsPanel({
  apiAccess,
}: {
  apiAccess: ApiAccessApplication;
}) {
  const [audit, setAudit] = useState<AutomationApiAuditEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState(initialPermissions);
  const [repositoryIds, setRepositoryIds] = useState<string[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [tokens, setTokens] = useState<AutomationApiToken[]>([]);
  const administration = apiAccess.administration;
  const load = useCallback(async () => {
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
    if (name.trim().length === 0 || scopes.length === 0) {
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
            <ApiAccessAudit entries={audit} />
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
