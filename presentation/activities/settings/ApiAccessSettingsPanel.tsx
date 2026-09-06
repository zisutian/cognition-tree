import {
  useMemo,
  useState,
} from "react";
import type {
  AutomationApiScope,
  AutomationApiToken,
  TrustedClientToken,
} from "../../../application/apiAccess/index.ts";
import {
  Button,
  EmptyState,
  ChoiceGroup,
  InputControl,
  FieldRow,
  FormActions,
  FormLayout,
  ManagementList,
  ManagementRow,
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
  useExclusiveAsyncAction,
} from "../../ui/index.ts";





import type {
  ApiAccessSelection,
} from "./settingsTypes.ts";
import type {
  ApiAccessSettingsPanelView,
} from "./useApiAccessSettingsSession.ts";

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
  disabled,
  onRevoke,
  onSelect,
  selection,
  tokens,
}: {
  disabled: boolean;
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
          actions={<Button disabled={disabled} onClick={() => onRevoke(token.id)} type="button" variant="danger">撤销</Button>}
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
  disabled,
  onRevoke,
  onSelect,
  selection,
  tokens,
}: {
  disabled: boolean;
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
          actions={<Button disabled={disabled} onClick={() => onRevoke(token.id)} type="button" variant="danger">撤销</Button>}
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
  onSelectionChange,
  selection,
  session,
}: {
  onSelectionChange(selection: ApiAccessSelection): void;
  selection: ApiAccessSelection;
  session: ApiAccessSettingsPanelView;
}) {
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState(initialPermissions);
  const [repositoryIds, setRepositoryIds] = useState<string[] | null>(null);
  const [trustedClientName, setTrustedClientName] = useState("");
  const operationAction = useExclusiveAsyncAction();
  const {
    errorMessage,
    loading,
    tokens,
    trustedClientTokens,
  } = session.snapshot;
  const busy = loading || operationAction.busy;

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
    const created = await operationAction.run(() =>
      session.createToken({
        name: name.trim(),
        repositoryIds: permissions.workspace === "none"
          ? null
          : repositoryIds,
        scopes,
      })
    );

    if (!created) return;
    setName("");
    onSelectionChange({ id: created.id, kind: "automation" });
  };
  const revokeToken = async (tokenId: string) => {
    const index = tokens.findIndex(({ id }) => id === tokenId);
    const remaining = tokens.filter(({ id }) => id !== tokenId);
    const revoked = await operationAction.run(
      () => session.revokeToken(tokenId),
    );

    if (!revoked) return;
    const next = remaining[
      Math.min(Math.max(index, 0), Math.max(0, remaining.length - 1))
    ];

    onSelectionChange(next
      ? { id: next.id, kind: "automation" }
      : trustedClientTokens[0]
        ? { id: trustedClientTokens[0].id, kind: "trusted" }
        : { kind: "overview" });
  };
  const createTrustedClientToken = async () => {
    const tokenName = trustedClientName.trim();

    if (!tokenName) return;
    const created = await operationAction.run(
      () => session.createTrustedClientToken(tokenName),
    );

    if (!created) return;
    setTrustedClientName("");
    onSelectionChange({ id: created.id, kind: "trusted" });
  };
  const revokeTrustedClientToken = async (tokenId: string) => {
    const index = trustedClientTokens.findIndex(({ id }) => id === tokenId);
    const remaining = trustedClientTokens.filter(({ id }) => id !== tokenId);
    const revoked = await operationAction.run(
      () => session.revokeTrustedClientToken(tokenId),
    );

    if (!revoked) return;
    const next = remaining[
      Math.min(Math.max(index, 0), Math.max(0, remaining.length - 1))
    ];

    onSelectionChange(next
      ? { id: next.id, kind: "trusted" }
      : tokens[0]
        ? { id: tokens[0].id, kind: "automation" }
        : { kind: "overview" });
  };

  return (
    <ToolPanel
      actions={(
        <Button disabled={busy} onClick={() => void operationAction.run(session.load)} type="button">
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
                          { disabled: session.repositories.length === 0, label: "指定仓库", value: "selected" },
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
                          options={session.repositories.map(({ id, label }) => ({
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
                <Button disabled={busy || name.trim().length === 0 || scopes.length === 0 || (permissions.workspace !== "none" && repositoryIds !== null && repositoryIds.length === 0)} onClick={() => void createToken()} type="button" variant="primary">创建令牌</Button>
              </FormActions>
            </FormLayout>
            <h3 className="settings-subsection-heading">现有令牌</h3>
            {loading && tokens.length === 0 ? <EmptyState compact description="正在读取自动化令牌。" title="正在加载" /> : <TokenList disabled={busy} onRevoke={(id) => void revokeToken(id)} onSelect={(id) => onSelectionChange({ id, kind: "automation" })} selection={selection} tokens={tokens} />}
          </ToolSection>
          <ToolSection title="可信客户端">
            <FormLayout>
              <FieldRow fieldId="settings-trusted-client-name" label="名称">
                {(accessibility) => (
                  <InputControl {...accessibility} aria-label="可信客户端名称" maxLength={80} onChange={(event) => setTrustedClientName(event.currentTarget.value)} placeholder="名称" value={trustedClientName} />
                )}
              </FieldRow>
              <FormActions>
                <Button disabled={busy || trustedClientName.trim().length === 0} onClick={() => void createTrustedClientToken()} type="button" variant="primary">创建可信客户端令牌</Button>
              </FormActions>
            </FormLayout>
            <TrustedClientTokenList
              disabled={busy}
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
