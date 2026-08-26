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
} from "../../ui/shared/primitives";
import { ChoiceGroup, InputControl } from "../../ui/shared/controls";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import {
  ManagementList,
  ManagementRow,
} from "../../ui/shared/ManagementList";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type {
  ApiAccessSelection,
  ApiAccessStatusSnapshot,
} from "./settingsTypes";

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

function TokenList({
  onRevoke,
  onSelect,
  selection,
  tokens,
}: {
  onRevoke(tokenId: string): void;
  onSelect(tokenId: string): void;
  selection: ApiAccessSelection;
  tokens: AutomationApiToken[];
}) {
  if (tokens.length === 0) {
    return <EmptyState compact title="尚未创建自动化令牌" />;
  }
  return (
    <ManagementList aria-label="自动化令牌">
      {tokens.map((token) => (
        <ManagementRow
          actions={<Button onClick={() => onRevoke(token.id)} type="button" variant="danger">撤销</Button>}
          key={token.id}
          onSelect={() => onSelect(token.id)}
          selected={selection.kind === "automation" && selection.id === token.id}
          status={<code>{token.prefix}…</code>}
          title={token.name}
        />
      ))}
    </ManagementList>
  );
}

function TrustedClientTokenList({
  onRevoke,
  onSelect,
  selection,
  tokens,
}: {
  onRevoke(tokenId: string): void;
  onSelect(tokenId: string): void;
  selection: ApiAccessSelection;
  tokens: TrustedClientToken[];
}) {
  if (tokens.length === 0) {
    return <EmptyState compact title="尚未创建可信客户端令牌" />;
  }
  return (
    <ManagementList aria-label="可信客户端令牌">
      {tokens.map((token) => (
        <ManagementRow
          actions={<Button onClick={() => onRevoke(token.id)} type="button" variant="danger">撤销</Button>}
          key={token.id}
          onSelect={() => onSelect(token.id)}
          selected={selection.kind === "trusted" && selection.id === token.id}
          status={<code>{token.prefix}…</code>}
          title={token.name}
        />
      ))}
    </ManagementList>
  );
}

export function ApiAccessSettingsPanel({
  apiAccess,
  onSelectionChange,
  onStatusChange,
  selection,
}: {
  apiAccess: ApiAccessApplication;
  onSelectionChange(selection: ApiAccessSelection): void;
  onStatusChange(snapshot: ApiAccessStatusSnapshot): void;
  selection: ApiAccessSelection;
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
  const dismissSecret = useCallback(() => setSecret(null), []);
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

  useEffect(() => {
    onStatusChange({
      dismissSecret,
      errorMessage,
      loading,
      secret,
      tokens,
      trustedClientTokens,
    });
  }, [dismissSecret, errorMessage, loading, onStatusChange, secret, tokens, trustedClientTokens]);

  useEffect(() => {
    const selectionExists = selection.kind === "automation"
      ? tokens.some(({ id }) => id === selection.id)
      : selection.kind === "trusted"
        ? trustedClientTokens.some(({ id }) => id === selection.id)
        : false;

    if (selectionExists) return;
    if (tokens[0]) {
      onSelectionChange({ id: tokens[0].id, kind: "automation" });
    } else if (trustedClientTokens[0]) {
      onSelectionChange({ id: trustedClientTokens[0].id, kind: "trusted" });
    } else if (selection.kind !== "overview") {
      onSelectionChange({ kind: "overview" });
    }
  }, [onSelectionChange, selection, tokens, trustedClientTokens]);

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
      onSelectionChange({ id: created.token.id, kind: "automation" });
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
      setTokens((current) => {
        const index = current.findIndex(({ id }) => id === tokenId);
        const remaining = current.filter(({ id }) => id !== tokenId);
        const next = remaining[Math.min(Math.max(index, 0), Math.max(0, remaining.length - 1))];

        onSelectionChange(next
          ? { id: next.id, kind: "automation" }
          : trustedClientTokens[0]
            ? { id: trustedClientTokens[0].id, kind: "trusted" }
            : { kind: "overview" });
        return remaining;
      });
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
      onSelectionChange({ id: created.token.id, kind: "trusted" });
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
      setTrustedClientTokens((current) => {
        const index = current.findIndex(({ id }) => id === tokenId);
        const remaining = current.filter(({ id }) => id !== tokenId);
        const next = remaining[Math.min(Math.max(index, 0), Math.max(0, remaining.length - 1))];

        onSelectionChange(next
          ? { id: next.id, kind: "trusted" }
          : tokens[0]
            ? { id: tokens[0].id, kind: "automation" }
            : { kind: "overview" });
        return remaining;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法撤销可信客户端令牌。");
    }
  };

  return (
    <ToolPanel
      actions={(
        <Button disabled={loading} onClick={() => void load()} type="button">
          刷新
        </Button>
      )}
      aria-label="API 访问"
      className="settings-panel"
      title="API 访问"
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          {errorMessage
            ? <p className="settings-api-error" role="alert">{errorMessage}</p>
            : null}
          <ToolSection title="Automation">
            <FormLayout>
              <FieldRow fieldId="settings-api-token-name" label="名称">
                {(accessibility) => (
                  <InputControl {...accessibility} maxLength={80} onChange={(event) => setName(event.currentTarget.value)} placeholder="名称" value={name} />
                )}
              </FieldRow>
              {automationDomains.map(({ id, label, permissionLabel }) => (
                <FieldRow
                  fieldId={`settings-api-${id}-permission`}
                  key={id}
                  label={`${label} 权限`}
                >
                  {(accessibility) => (
                    <ChoiceGroup
                      {...accessibility}
                      ariaLabel={permissionLabel}
                      mode="single"
                      onChange={(value) => updatePermission(id, value)}
                      options={permissionLevels}
                      value={permissions[id]}
                    />
                  )}
                </FieldRow>
              ))}
              {permissions.workspace !== "none" ? (
                <>
                  <FieldRow fieldId="settings-api-repository-scope" label="仓库范围">
                    {(accessibility) => (
                      <ChoiceGroup
                        {...accessibility}
                        ariaLabel="仓库范围"
                        mode="single"
                        onChange={(value) => setRepositoryIds(value === "all" ? null : [])}
                        options={[
                          { label: "全部仓库", value: "all" },
                          { disabled: apiAccess.repositories.length === 0, label: "指定仓库", value: "selected" },
                        ]}
                        value={repositoryIds === null ? "all" : "selected"}
                      />
                    )}
                  </FieldRow>
                  {repositoryIds === null ? null : (
                    <FieldRow fieldId="settings-api-allowed-repositories" label="允许的仓库">
                      {(accessibility) => (
                        <ChoiceGroup
                          {...accessibility}
                          ariaLabel="允许访问的 Workspace 仓库"
                          layout="wrap"
                          mode="multiple"
                          onChange={setRepositoryIds}
                          options={apiAccess.repositories.map(({ id, label }) => ({
                            ariaLabel: `${label}（${id}）`,
                            label,
                            value: id,
                          }))}
                          values={repositoryIds}
                        />
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
            {loading && tokens.length === 0 ? <EmptyState compact description="正在读取自动化令牌。" title="正在加载" /> : <TokenList onRevoke={(id) => void revokeToken(id)} onSelect={(id) => onSelectionChange({ id, kind: "automation" })} selection={selection} tokens={tokens} />}
          </ToolSection>
          <ToolSection title="可信客户端">
            <FormLayout>
              <FieldRow fieldId="settings-trusted-client-name" label="名称">
                {(accessibility) => (
                  <InputControl {...accessibility} aria-label="可信客户端名称" maxLength={80} onChange={(event) => setTrustedClientName(event.currentTarget.value)} placeholder="名称" value={trustedClientName} />
                )}
              </FieldRow>
              <FormActions>
                <Button disabled={loading || trustedClientName.trim().length === 0} onClick={() => void createTrustedClientToken()} type="button" variant="primary">创建可信客户端令牌</Button>
              </FormActions>
            </FormLayout>
            <TrustedClientTokenList
              onRevoke={(id) => void revokeTrustedClientToken(id)}
              onSelect={(id) => onSelectionChange({ id, kind: "trusted" })}
              selection={selection}
              tokens={trustedClientTokens}
            />
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
