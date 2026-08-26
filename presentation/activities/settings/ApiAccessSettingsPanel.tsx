import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ApiAccessApplication,
  AutomationApiScope,
  AutomationApiToken,
  TrustedClientToken,
} from "../../../application/apiAccess/apiAccessAdministration";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../ui/shared/primitives";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import {
  ManagementList,
  ManagementRow,
} from "../../ui/shared/ManagementList";

function formatApiAccessTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用";
}

type AutomationDomain = "journal" | "todo" | "workspace";
type PermissionLevel = "none" | "read";

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
    return [`${domain}:read` as AutomationApiScope];
  });
}

function formatTokenScopes(scopes: readonly AutomationApiScope[]) {
  return automationDomains.flatMap(({ id, label }) => {
    const level = scopes.includes(`${id}:read`) ? "只读" : null;

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
    return <EmptyState compact description="自动化令牌仅提供内容只读访问。" title="尚未创建自动化令牌" />;
  }
  return (
    <ManagementList aria-label="自动化令牌">
      {tokens.map((token) => (
        <ManagementRow
          actions={<Button className="settings-danger-action" onClick={() => onRevoke(token.id)} type="button">撤销</Button>}
          description={`${formatTokenScopes(token.scopes)} · ${formatRepositoryScope(token.repositoryIds, repositories)} · ${token.lastUsedAt ? `最近使用 ${formatApiAccessTimestamp(token.lastUsedAt)}` : "尚未使用"}`}
          key={token.id}
          status={<code>{token.prefix}…</code>}
          title={token.name}
        />
      ))}
    </ManagementList>
  );
}

function TrustedClientTokenList({
  onRevoke,
  tokens,
}: {
  onRevoke(tokenId: string): void;
  tokens: TrustedClientToken[];
}) {
  if (tokens.length === 0) {
    return <EmptyState compact description="可信客户端拥有全部内容同步权限。" title="尚未创建可信客户端令牌" />;
  }
  return (
    <ManagementList aria-label="可信客户端令牌">
      {tokens.map((token) => (
        <ManagementRow
          actions={<Button className="settings-danger-action" onClick={() => onRevoke(token.id)} type="button">撤销</Button>}
          description={`Workspace、日记与代办完整同步权限 · ${token.lastUsedAt ? `最近使用 ${formatApiAccessTimestamp(token.lastUsedAt)}` : "尚未使用"}`}
          key={token.id}
          status={<code>{token.prefix}…</code>}
          title={token.name}
        />
      ))}
    </ManagementList>
  );
}

export function ApiAccessSettingsPanel({
  apiAccess,
}: {
  apiAccess: ApiAccessApplication;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState(initialPermissions);
  const [repositoryIds, setRepositoryIds] = useState<string[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [tokens, setTokens] = useState<AutomationApiToken[]>([]);
  const [trustedClientName, setTrustedClientName] = useState("");
  const [trustedClientTokens, setTrustedClientTokens] = useState<TrustedClientToken[]>([]);
  const administration = apiAccess.administration;
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const [tokenResult, trustedResult] = await Promise.allSettled([
      administration.listTokens(),
      administration.listTrustedClientTokens(),
    ]);
    const failures: string[] = [];

    if (tokenResult.status === "fulfilled") {
      setTokens(tokenResult.value);
    } else {
      failures.push(
        tokenResult.reason instanceof Error
          ? `无法加载自动化令牌：${tokenResult.reason.message}`
          : "无法加载自动化令牌。",
      );
    }
    if (trustedResult.status === "fulfilled") {
      setTrustedClientTokens(trustedResult.value);
    } else {
      failures.push(
        trustedResult.reason instanceof Error
          ? `无法加载可信客户端令牌：${trustedResult.reason.message}`
          : "无法加载可信客户端令牌。",
      );
    }
    setErrorMessage(failures.length > 0 ? failures.join(" ") : null);
    setLoading(false);
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
  const createTrustedClientToken = async () => {
    const tokenName = trustedClientName.trim();

    if (!tokenName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const created = await administration.createTrustedClientToken(tokenName);

      setSecret(created.secret);
      setTrustedClientName("");
      setTrustedClientTokens((current) => [created.token, ...current]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法创建可信客户端令牌。");
    } finally {
      setLoading(false);
    }
  };
  const revokeTrustedClientToken = async (tokenId: string) => {
    setErrorMessage(null);
    try {
      await administration.revokeTrustedClientToken(tokenId);
      setTrustedClientTokens((current) => current.filter(({ id }) => id !== tokenId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法撤销可信客户端令牌。");
    }
  };

  return (
    <Panel aria-label="API 访问" className="settings-panel">
      <PanelHeader
        actions={(
          <Button disabled={loading} onClick={() => void load()} type="button">
            刷新
          </Button>
        )}
        title="API 访问"
      />
      <PanelBody scroll>
        <div className="settings-content-column settings-api-content">
          <p className="settings-muted">
            自动化令牌仅用于 <code>/api/v3/content/*</code> 只读接口，
            不能访问 sync、agent 或 admin。
          </p>
          <p className="settings-muted">
            可信客户端令牌可通过 <code>/api/v3/sync/*</code> 读取并同步全部内容，
            但不能访问 admin、agent、auth 或仓库管理。
          </p>
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
          <Section className="settings-api-section" title="Automation">
            <FormLayout>
              <FieldRow fieldId="settings-api-token-name" label="名称">
                {(accessibility) => (
                  <input {...accessibility} className="ui-input" maxLength={80} onChange={(event) => setName(event.currentTarget.value)} placeholder="例如：笔记整理工具" value={name} />
                )}
              </FieldRow>
              {automationDomains.map(({ id, label, permissionLabel }) => (
                <FieldRow
                  fieldId={`settings-api-${id}-permission`}
                  key={id}
                  label={`${label} 权限`}
                >
                  {(accessibility) => (
                    <select {...accessibility} aria-label={permissionLabel} className="ui-input" onChange={(event) => updatePermission(id, event.currentTarget.value as PermissionLevel)} value={permissions[id]}>
                      {permissionLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                  )}
                </FieldRow>
              ))}
              {permissions.workspace !== "none" ? (
                <>
                  <FieldRow fieldId="settings-api-repository-scope" label="仓库范围">
                    {(accessibility) => (
                      <select {...accessibility} aria-label="仓库范围" className="ui-input" onChange={(event) => setRepositoryIds(event.currentTarget.value === "all" ? null : [])} value={repositoryIds === null ? "all" : "selected"}>
                        <option value="all">全部 Workspace 仓库</option>
                        <option disabled={apiAccess.repositories.length === 0} value="selected">指定 Workspace 仓库</option>
                      </select>
                    )}
                  </FieldRow>
                  {repositoryIds === null ? null : (
                    <FieldRow fieldId="settings-api-allowed-repositories" label="允许的仓库">
                      {(accessibility) => (
                        <select {...accessibility} aria-label="允许访问的 Workspace 仓库" className="ui-input settings-api-repository-select" multiple onChange={(event) => setRepositoryIds(Array.from(event.currentTarget.selectedOptions, ({ value }) => value))} size={Math.min(Math.max(apiAccess.repositories.length, 2), 6)} value={repositoryIds}>
                          {apiAccess.repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.label}</option>)}
                        </select>
                      )}
                    </FieldRow>
                  )}
                </>
              ) : null}
              <FormActions>
                <Button disabled={loading || name.trim().length === 0 || scopes.length === 0 || (permissions.workspace !== "none" && repositoryIds !== null && repositoryIds.length === 0)} onClick={() => void createToken()} type="button" variant="primary">创建令牌</Button>
              </FormActions>
            </FormLayout>
            <h3 className="settings-subsection-heading">现有令牌</h3>
            {loading && tokens.length === 0 ? <EmptyState compact description="正在读取自动化令牌。" title="正在加载" /> : <TokenList onRevoke={(id) => void revokeToken(id)} repositories={apiAccess.repositories} tokens={tokens} />}
          </Section>
          <Section className="settings-api-section" title="可信客户端">
            <FormLayout>
              <FieldRow description="该令牌等价于全部 Workspace、日记和代办内容的读取、创建、修改与删除权限。" fieldId="settings-trusted-client-name" label="名称">
                {(accessibility) => (
                  <input {...accessibility} aria-label="可信客户端名称" className="ui-input" maxLength={80} onChange={(event) => setTrustedClientName(event.currentTarget.value)} placeholder="例如：每日 Codex" value={trustedClientName} />
                )}
              </FieldRow>
              <FormActions>
                <Button disabled={loading || trustedClientName.trim().length === 0} onClick={() => void createTrustedClientToken()} type="button" variant="primary">创建可信客户端令牌</Button>
              </FormActions>
            </FormLayout>
            <TrustedClientTokenList
              onRevoke={(id) => void revokeTrustedClientToken(id)}
              tokens={trustedClientTokens}
            />
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}
