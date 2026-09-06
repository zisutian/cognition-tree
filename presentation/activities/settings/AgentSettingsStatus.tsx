// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentApplication,
  AgentOllamaResidentContext,
  AgentProfileView,
  AgentProviderView,
} from "../../../application/agent/index.ts";
import {
  StatusBadge,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";

import type { AgentSettingsRoute } from "./settingsTypes.ts";

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

function ProviderStatus({ agent, provider }: {
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
          <ToolPropertyRow label="私网许可" value={provider.privateNetworkAccess === "confirmed" ? "已允许" : "不需要"} />
        </ToolPropertyList>
      </ToolSection>
      {login?.status === "pending" ? (
        <ToolSection title="设备登录">
          <ToolPropertyList aria-label="ChatGPT 设备登录">
            <ToolPropertyRow label="验证地址" value={<a href={login.verificationUrl} rel="noreferrer" target="_blank">打开登录页</a>} />
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

function ProfileStatus({ agent, profile }: {
  agent: AgentApplication;
  profile: AgentProfileView;
}) {
  const check = agent.configurationState.conformanceChecks[profile.id];
  const provider = agent.configurationState.configuration?.providers.find(
    ({ id }) => id === profile.providerId,
  );
  const conformanceStatus = check?.status ??
    (profile.conformance ? "succeeded" : "not-run");
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

export function AgentSettingsStatus({ agent, route }: {
  agent: AgentApplication;
  route: AgentSettingsRoute;
}) {
  const configuration = agent.configurationState.configuration;
  const providers = configuration?.providers ?? [];
  const profiles = configuration?.profiles ?? [];
  const selectedProvider = route.page === "providers"
    ? providers.find(({ id }) => id === route.selectedProviderId) ?? null
    : null;
  const selectedProfile = route.page === "profiles"
    ? profiles.find(({ id }) => id === route.selectedProfileId) ?? null
    : null;
  const preferredProfile = profiles.find(
    ({ id }) => id === agent.state.preferredProfileId,
  );

  if (selectedProvider) {
    return <ProviderStatus agent={agent} provider={selectedProvider} />;
  }
  if (selectedProfile) {
    return <ProfileStatus agent={agent} profile={selectedProfile} />;
  }
  return (
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
        <ToolPropertyRow
          label="默认 Profile"
          value={agent.state.preferredProfileId === null
            ? "未选择"
            : preferredProfile?.label ?? "不可用"}
        />
      </ToolPropertyList>
    </ToolSection>
  );
}
