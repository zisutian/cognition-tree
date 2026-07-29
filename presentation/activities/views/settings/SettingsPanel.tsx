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

type DomainPermission = {
  delete: boolean;
  read: boolean;
  write: boolean;
};

const initialPermissions: Record<
  "journal" | "todo" | "workspace",
  DomainPermission
> = {
  journal: { delete: false, read: true, write: false },
  todo: { delete: false, read: true, write: false },
  workspace: { delete: false, read: true, write: false },
};

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用";
}

function permissionsToScopes(
  permissions: typeof initialPermissions,
): AutomationApiScope[] {
  return (Object.entries(permissions) as Array<
    [keyof typeof permissions, DomainPermission]
  >).flatMap(([domain, permission]) => [
    ...(permission.read ? [`${domain}:read` as AutomationApiScope] : []),
    ...(permission.write ? [`${domain}:write` as AutomationApiScope] : []),
    ...(permission.delete ? [`${domain}:delete` as AutomationApiScope] : []),
  ]);
}

function TokenList({
  onRevoke,
  tokens,
}: {
  onRevoke(tokenId: string): void;
  tokens: AutomationApiToken[];
}) {
  if (tokens.length === 0) {
    return <p className="settings-muted">尚未创建自动化令牌。</p>;
  }
  return (
    <ul className="settings-api-list" aria-label="自动化令牌">
      {tokens.map((token) => (
        <li key={token.id}>
          <div>
            <strong>{token.name}</strong>
            <code>{token.prefix}…</code>
          </div>
          <p>
            {token.scopes.join(" · ")}
            {" · "}
            {token.repositoryIds === null
              ? "全部仓库"
              : `${token.repositoryIds.length} 个仓库`}
          </p>
          <p>
            创建于 {formatTimestamp(token.createdAt)}
            {" · "}
            最后使用 {formatTimestamp(token.lastUsedAt)}
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
    <ol className="settings-api-list" aria-label="最近 API 操作">
      {entries.map((entry) => (
        <li key={`${entry.requestId}:${entry.commandId}`}>
          <div>
            <strong>{entry.commandKind}</strong>
            <span>{entry.result === "committed" ? "已提交" : "失败"}</span>
          </div>
          <p>{formatTimestamp(entry.occurredAt)} · {entry.principalId}</p>
          <p>
            资源 {entry.resourceIds.join(", ") || "—"}
            {entry.blockIds.length > 0
              ? ` · 块 ${entry.blockIds.join(", ")}`
              : ""}
          </p>
        </li>
      ))}
    </ol>
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
    domain: keyof typeof permissions,
    key: keyof DomainPermission,
    checked: boolean,
  ) => {
    setPermissions((current) => ({
      ...current,
      [domain]: {
        ...current[domain],
        [key]: checked,
        ...(key === "delete" && checked ? { write: true } : {}),
        ...(key === "write" && !checked ? { delete: false } : {}),
      },
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
        repositoryIds,
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
      <PanelHeader
        actions={<Button onClick={() => void load()}>刷新</Button>}
        title="API 访问"
      />
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
                <Button onClick={() => setSecret(null)}>我已保存</Button>
              </section>
            )
            : null}
          <Section title="创建自动化令牌">
            <label className="settings-api-field">
              <span>名称</span>
              <input
                className="ui-input"
                maxLength={80}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="例如：笔记整理工具"
                value={name}
              />
            </label>
            <fieldset className="settings-api-permissions">
              <legend>领域权限</legend>
              {(Object.keys(permissions) as Array<keyof typeof permissions>)
                .map((domain) => (
                  <div key={domain}>
                    <strong>{domain}</strong>
                    {(["read", "write", "delete"] as const).map((permission) => (
                      <label key={permission}>
                        <input
                          checked={permissions[domain][permission]}
                          onChange={(event) =>
                            updatePermission(
                              domain,
                              permission,
                              event.currentTarget.checked,
                            )}
                          type="checkbox"
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                ))}
            </fieldset>
            <fieldset className="settings-api-repositories">
              <legend>Workspace 仓库范围</legend>
              <label>
                <input
                  checked={repositoryIds === null}
                  onChange={() => setRepositoryIds(null)}
                  type="radio"
                />
                全部仓库
              </label>
              <label>
                <input
                  checked={repositoryIds !== null}
                  onChange={() => setRepositoryIds([])}
                  type="radio"
                />
                指定仓库
              </label>
              {repositoryIds !== null
                ? apiAccess.repositories.map((repository) => (
                    <label key={repository.id}>
                      <input
                        checked={repositoryIds.includes(repository.id)}
                        onChange={(event) =>
                          setRepositoryIds((current) => {
                            const values = current ?? [];

                            return event.currentTarget.checked
                              ? [...values, repository.id]
                              : values.filter((id) => id !== repository.id);
                          })}
                        type="checkbox"
                      />
                      {repository.label}
                    </label>
                  ))
                : null}
            </fieldset>
            <Button
              disabled={
                loading ||
                name.trim().length === 0 ||
                scopes.length === 0 ||
                (repositoryIds !== null && repositoryIds.length === 0)
              }
              onClick={() => void createToken()}
              variant="primary"
            >
              创建令牌
            </Button>
          </Section>
          <Section title="现有令牌">
            {loading && tokens.length === 0
              ? <p className="settings-muted">正在加载…</p>
              : <TokenList onRevoke={(id) => void revokeToken(id)} tokens={tokens} />}
          </Section>
          <Section title="最近自动化操作">
            <AuditList entries={audit} />
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
