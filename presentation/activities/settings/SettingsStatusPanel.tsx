// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentApplication,
  AgentOllamaResidentContext,
  AgentProfileView,
  AgentProviderView,
} from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";
import { Button, EmptyState } from "../../ui/shared/primitives";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import {
  ToolDetailPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  OperationsStatusSnapshot,
  SettingsSection,
} from "./settingsTypes";
import type {
  ApiAccessSettingsStatusView,
} from "./useApiAccessSettingsSession";

const authenticationLabels = {
  configured: "已配置",
  missing: "未配置",
  "not-required": "无需认证",
  unknown: "未知",
} as const;

function residentContextLabel(context: AgentOllamaResidentContext) {
  if (context.status === "not-loaded") return "未加载";
  if (context.status === "loaded-unreported") return "未报告";
  return `${context.allocatedContextTokens} tokens`;
}

function providerStatus({
  agent,
  provider,
}: {
  agent: AgentApplication;
  provider: AgentProviderView;
}) {
  const login = agent.configurationState.codexDeviceLogins[provider.id];
  const probe = agent.configurationState.probes[provider.id];

  return (
    <ToolSectionStack>
      <ToolSection title={provider.label}>
        <ToolPropertyList aria-label={`${provider.label} 状态`}>
          <ToolPropertyRow label="类型" value={provider.kind} />
          <ToolPropertyRow
            label="认证"
            value={(
              <StatusBadge tone={provider.authenticationStatus === "missing" ? "warning" : "success"}>
                {authenticationLabels[provider.authenticationStatus]}
              </StatusBadge>
            )}
          />
          <ToolPropertyRow label="地址" value={<code>{provider.baseUrl ?? "Codex app-server"}</code>} />
          <ToolPropertyRow label="版本" value={provider.version} />
          <ToolPropertyRow
            label="私网许可"
            value={provider.privateNetworkAccess === "confirmed" ? "已允许" : "不需要"}
          />
        </ToolPropertyList>
      </ToolSection>
      {login?.status === "pending" ? (
        <ToolSection title="设备登录">
          <ToolPropertyList aria-label="ChatGPT 设备登录">
            <ToolPropertyRow
              label="验证地址"
              value={<a href={login.verificationUrl} rel="noreferrer" target="_blank">打开登录页</a>}
            />
            <ToolPropertyRow label="设备码" value={<code>{login.userCode}</code>} />
          </ToolPropertyList>
        </ToolSection>
      ) : null}
      {probe ? (
        <ToolSection title="最近探测">
          <ToolPropertyList aria-label={`${provider.label} 探测状态`}>
            <ToolPropertyRow label="连接" value={probe.reachable ? "可达" : "不可达"} />
            <ToolPropertyRow label="探测时间" value={new Date(probe.probedAt).toLocaleString()} />
            <ToolPropertyRow label="模型" value={probe.models.join("、") || "无"} />
            {probe.modelContexts.map((context) => (
              <ToolPropertyRow
                key={context.model}
                label={context.model}
                value={`上限 ${context.declaredMaximumContextTokens ?? "未知"} · 驻留 ${residentContextLabel(context.residentContext)}`}
              />
            ))}
          </ToolPropertyList>
        </ToolSection>
      ) : null}
    </ToolSectionStack>
  );
}

function profileStatus({
  agent,
  profile,
}: {
  agent: AgentApplication;
  profile: AgentProfileView;
}) {
  const check = agent.configurationState.conformanceChecks[profile.id];
  const provider = agent.configurationState.configuration?.providers.find(
    ({ id }) => id === profile.providerId,
  );
  const conformanceStatus = check?.status ?? (profile.conformance ? "succeeded" : "not-run");
  const conformanceLabel = conformanceStatus === "running"
    ? "检查中"
    : conformanceStatus === "succeeded"
      ? "已通过"
      : conformanceStatus === "failed"
        ? "失败"
        : conformanceStatus === "cancelled" ? "已取消" : "未检查";

  return (
    <ToolSectionStack>
      <ToolSection title={profile.label}>
        <ToolPropertyList aria-label={`${profile.label} 状态`}>
          <ToolPropertyRow
            label="状态"
            value={(
              <StatusBadge tone={profile.availability === "available" ? "success" : "warning"}>
                {profile.availability === "available" ? "可用" : "不可用"}
              </StatusBadge>
            )}
          />
          <ToolPropertyRow label="Provider" value={provider?.label ?? profile.providerId} />
          <ToolPropertyRow label="模型" value={profile.model} />
          <ToolPropertyRow label="版本" value={profile.version} />
          <ToolPropertyRow label="会话上限" value={profile.maxResidentSessions} />
          <ToolPropertyRow label="超时" value={`${profile.timeoutMilliseconds} ms`} />
        </ToolPropertyList>
      </ToolSection>
      <ToolSection title="符合性">
        <ToolPropertyList aria-label={`${profile.label} 符合性`}>
          <ToolPropertyRow
            label="结果"
            value={(
              <StatusBadge tone={conformanceStatus === "succeeded" ? "success" : conformanceStatus === "failed" ? "danger" : "neutral"}>
                {conformanceLabel}
              </StatusBadge>
            )}
          />
          {check?.status === "running" ? <ToolPropertyRow label="阶段" value={check.phase} /> : null}
          {check?.errorMessage ? <ToolPropertyRow label="原因" value={check.errorMessage} /> : null}
          {!check?.errorMessage && profile.unavailableReason ? <ToolPropertyRow label="原因" value={profile.unavailableReason} /> : null}
        </ToolPropertyList>
      </ToolSection>
    </ToolSectionStack>
  );
}

function systemStatus(system: SystemApplication) {
  const state = system.configurationState;
  const snapshot = state.configuration;

  if (!snapshot) {
    return <EmptyState compact description={state.errorMessage ?? "正在读取服务状态。"} title="服务状态不可用" />;
  }
  const nextAddress = snapshot.configuration.listenMode === "lan"
    ? snapshot.configuration.publicOrigin
    : `http://127.0.0.1:${snapshot.configuration.port}`;

  return (
    <ToolSectionStack>
      <ToolSection title="服务">
        <ToolPropertyList aria-label="服务状态">
          <ToolPropertyRow
            label="状态"
            value={(
              <StatusBadge tone={snapshot.restartRequired ? "warning" : "success"}>
                {snapshot.restartRequired ? "等待重启" : "已生效"}
              </StatusBadge>
            )}
          />
          <ToolPropertyRow label="当前监听" value={`${snapshot.effectiveConfiguration.listenMode === "loopback" ? "仅本机" : "局域网"} · ${snapshot.effectiveConfiguration.port}`} />
          <ToolPropertyRow label="当前数据根" value={<code>{snapshot.effectiveConfiguration.dataRoot}</code>} />
          <ToolPropertyRow label="访问地址" value={<code>{nextAddress}</code>} />
        </ToolPropertyList>
      </ToolSection>
      <ToolSection title="所有者凭据">
        <ToolPropertyList aria-label="所有者凭据状态">
          <ToolPropertyRow
            label="凭据"
            value={(
              <StatusBadge tone={snapshot.ownerCredentialConfigured ? "success" : "warning"}>
                {snapshot.ownerCredentialConfigured ? "已创建" : "未创建"}
              </StatusBadge>
            )}
          />
          {state.revealedOwnerSecret ? (
            <ToolPropertyRow
              actions={<Button onClick={() => system.configurationController.dismissRevealedOwnerSecret()} type="button">关闭显示</Button>}
              label="新密钥"
              value={<code>{state.revealedOwnerSecret}</code>}
            />
          ) : null}
        </ToolPropertyList>
      </ToolSection>
      {state.migration ? (
        <ToolSection title="数据根迁移">
          <ToolPropertyList aria-label="数据根迁移状态">
            <ToolPropertyRow label="状态" value={state.migration.status} />
            {state.migration.errorMessage ? <ToolPropertyRow label="错误" value={state.migration.errorMessage} /> : null}
          </ToolPropertyList>
        </ToolSection>
      ) : null}
    </ToolSectionStack>
  );
}

function apiAccessStatus({
  selection,
  session,
}: {
  selection: ApiAccessSelection;
  session: ApiAccessSettingsStatusView;
}) {
  const snapshot = session.snapshot;
  const automationToken = selection.kind === "automation"
    ? snapshot.tokens.find(({ id }) => id === selection.id) ?? null
    : null;
  const trustedToken = selection.kind === "trusted"
    ? snapshot.trustedClientTokens.find(({ id }) => id === selection.id) ?? null
    : null;
  const token = automationToken ?? trustedToken;

  return (
    <ToolSectionStack>
      {snapshot.secret ? (
        <ToolSection title="新令牌">
          <ToolPropertyList aria-label="新令牌">
            <ToolPropertyRow
              actions={<Button onClick={session.dismissSecret} type="button">关闭显示</Button>}
              label="密钥"
              value={<code>{snapshot.secret}</code>}
            />
          </ToolPropertyList>
        </ToolSection>
      ) : null}
      {token ? (
        <ToolSection title={token.name}>
          <ToolPropertyList aria-label={`${token.name} 状态`}>
            <ToolPropertyRow label="前缀" value={<code>{token.prefix}…</code>} />
            <ToolPropertyRow label="创建时间" value={new Date(token.createdAt).toLocaleString()} />
            <ToolPropertyRow label="最近使用" value={token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "从未使用"} />
            {automationToken ? (
              <>
                <ToolPropertyRow label="权限" value={automationToken.scopes.join("、")} />
                <ToolPropertyRow label="仓库" value={automationToken.repositoryIds?.join("、") || "全部仓库"} />
              </>
            ) : (
              <ToolPropertyRow label="权限" value="完整同步" />
            )}
          </ToolPropertyList>
        </ToolSection>
      ) : (
        <ToolSection title="API 访问">
          <ToolPropertyList aria-label="API 访问状态">
            <ToolPropertyRow label="状态" value={snapshot.loading ? "载入中" : snapshot.errorMessage ? "故障" : "就绪"} />
            <ToolPropertyRow label="自动化令牌" value={snapshot.tokens.length} />
            <ToolPropertyRow label="可信客户端" value={snapshot.trustedClientTokens.length} />
            {snapshot.errorMessage ? <ToolPropertyRow label="错误" value={snapshot.errorMessage} /> : null}
          </ToolPropertyList>
        </ToolSection>
      )}
    </ToolSectionStack>
  );
}

function operationStatus({
  selectedEntryId,
  snapshot,
}: {
  selectedEntryId: string | null;
  snapshot: OperationsStatusSnapshot;
}) {
  const entry = snapshot.entries.find(({ id }) => id === selectedEntryId) ?? null;

  if (!entry) {
    return (
      <ToolSection title="审计">
        <ToolPropertyList aria-label="审计状态">
          <ToolPropertyRow label="状态" value={snapshot.loading ? "载入中" : snapshot.status?.status === "unavailable" ? "不可用" : "就绪"} />
          <ToolPropertyRow label="记录" value={snapshot.entries.length} />
          {snapshot.status?.status === "unavailable" ? <ToolPropertyRow label="原因" value={snapshot.status.message} /> : null}
          {snapshot.errorMessage ? <ToolPropertyRow label="错误" value={snapshot.errorMessage} /> : null}
        </ToolPropertyList>
      </ToolSection>
    );
  }

  return (
    <ToolSectionStack>
      <ToolSection title={new Date(entry.updatedAt).toLocaleString()}>
        <ToolPropertyList aria-label="审计记录状态">
          <ToolPropertyRow label="来源" value={entry.source === "agent" ? "智能体" : "可信客户端"} />
          <ToolPropertyRow label="结果" value={entry.result} />
          <ToolPropertyRow label="路由" value={<code>{entry.route}</code>} />
          <ToolPropertyRow label="资源" value={entry.resourceIds.length} />
          <ToolPropertyRow label="块" value={entry.blockIds.length} />
        </ToolPropertyList>
      </ToolSection>
      <ToolSection title="技术详情">
        <ToolPropertyList aria-label="操作技术详情">
          <ToolPropertyRow label="请求 ID" value={<code>{entry.requestId}</code>} />
          <ToolPropertyRow label="操作 ID" value={<code>{entry.id}</code>} />
          <ToolPropertyRow label="提交前 revision" value={<code>{entry.beforeRevision}</code>} />
          <ToolPropertyRow label="提交后 revision" value={<code>{entry.afterRevision ?? "—"}</code>} />
          {entry.source === "agent" ? (
            <>
              <ToolPropertyRow label="Proposal" value={<code>{entry.technical.proposalId} v{entry.technical.proposalVersion}</code>} />
              <ToolPropertyRow label="Runtime" value={`${entry.technical.runtimeKind} · ${entry.technical.profileId} v${entry.technical.profileVersion}`} />
              <ToolPropertyRow label="Digest" value={<code>{entry.technical.digest}</code>} />
            </>
          ) : (
            <ToolPropertyRow label="Intent digest" value={<code>{entry.technical.intentDigest}</code>} />
          )}
        </ToolPropertyList>
      </ToolSection>
    </ToolSectionStack>
  );
}

export function SettingsStatusPanel({
  agent,
  agentSelection,
  apiAccessSession,
  apiAccessSelection,
  onCollapseDetail,
  operationsSelectedEntryId,
  operationsSnapshot,
  section,
  system,
}: {
  agent: AgentApplication;
  agentSelection: AgentSettingsSelection;
  apiAccessSession: ApiAccessSettingsStatusView;
  apiAccessSelection: ApiAccessSelection;
  onCollapseDetail: () => void;
  operationsSelectedEntryId: string | null;
  operationsSnapshot: OperationsStatusSnapshot;
  section: SettingsSection;
  system: SystemApplication;
}) {
  let content;

  if (section === "system") {
    content = systemStatus(system);
  } else if (section === "agent") {
    const configuration = agent.configurationState.configuration;
    const providers = configuration?.providers ?? [];
    const profiles = configuration?.profiles ?? [];
    const selection = agentSelection.kind === "provider"
      ? providers.find(({ id }) => id === agentSelection.id) ?? null
      : agentSelection.kind === "profile"
        ? profiles.find(({ id }) => id === agentSelection.id) ?? null
        : null;

    content = agentSelection.kind === "provider" && selection
      ? providerStatus({ agent, provider: selection as AgentProviderView })
      : agentSelection.kind === "profile" && selection
        ? profileStatus({ agent, profile: selection as AgentProfileView })
        : (
            <ToolSection title="智能体">
              <ToolPropertyList aria-label="智能体状态">
                <ToolPropertyRow
                  label="状态"
                  value={(
                    <StatusBadge tone={agent.state.status?.enabled ? "success" : "warning"}>
                      {agent.state.status?.enabled ? "可用" : "不可用"}
                    </StatusBadge>
                  )}
                />
                <ToolPropertyRow label="Provider" value={providers.length} />
                <ToolPropertyRow label="Profile" value={profiles.length} />
                <ToolPropertyRow label="默认 Profile" value={agent.state.preferredProfileId ?? "未选择"} />
              </ToolPropertyList>
            </ToolSection>
          );
  } else if (section === "api-access") {
    content = apiAccessStatus({
      selection: apiAccessSelection,
      session: apiAccessSession,
    });
  } else if (section === "audit") {
    content = operationStatus({
      selectedEntryId: operationsSelectedEntryId,
      snapshot: operationsSnapshot,
    });
  } else {
    content = <EmptyState compact title="当前页面没有状态对象" />;
  }

  return (
    <ToolDetailPanel
      aria-label="设置状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">{content}</ToolPanelBody>
    </ToolDetailPanel>
  );
}
