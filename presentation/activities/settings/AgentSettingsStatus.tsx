// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationState,
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

import type { SettingsTarget } from "./settingsTypes.ts";

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

function ProviderStatus({
  state,
  provider,
}: {
  state: AgentConfigurationState;
  provider: AgentProviderView;
}) {
  const probe = state.probes[provider.id];

  return (
    <ToolSectionStack>
      <ToolSection title={provider.label}>
        <ToolPropertyList aria-label={`${provider.label} 状态`}>
          <ToolPropertyRow label="类型" value={provider.kind} />
          <ToolPropertyRow
            label="认证"
            value={
              <StatusBadge
                tone={
                  provider.authenticationStatus === "missing"
                    ? "warning"
                    : "success"
                }
              >
                {authenticationLabels[provider.authenticationStatus]}
              </StatusBadge>
            }
          />
          <ToolPropertyRow
            label="地址"
            value={<code>{provider.baseUrl ?? "Codex app-server"}</code>}
          />
          <ToolPropertyRow label="版本" value={provider.version} />
          <ToolPropertyRow
            label="私网许可"
            value={
              provider.privateNetworkAccess === "confirmed"
                ? "已允许"
                : "不需要"
            }
          />
        </ToolPropertyList>
      </ToolSection>
      {probe ? (
        <ToolSection title="最近探测">
          <ToolPropertyList aria-label={`${provider.label} 探测状态`}>
            <ToolPropertyRow
              label="连接"
              value={probe.reachable ? "可达" : "不可达"}
            />
            <ToolPropertyRow
              label="探测时间"
              value={new Date(probe.probedAt).toLocaleString()}
            />
            <ToolPropertyRow
              label="模型"
              value={probe.models.join("、") || "无"}
            />
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

function ProfileStatus({
  state,
  profile,
}: {
  state: AgentConfigurationState;
  profile: AgentProfileView;
}) {
  const check = state.conformanceChecks[profile.id];
  const provider = state.configuration?.providers.find(
    ({ id }) => id === profile.providerId,
  );
  const conformanceStatus =
    check?.status ?? (profile.conformance ? "succeeded" : "not-run");
  const conformanceLabel =
    conformanceStatus === "running"
      ? "检查中"
      : conformanceStatus === "succeeded"
        ? "已通过"
        : conformanceStatus === "failed"
          ? "失败"
          : conformanceStatus === "cancelled"
            ? "已取消"
            : "未检查";

  return (
    <ToolSectionStack>
      <ToolSection title={profile.label}>
        <ToolPropertyList aria-label={`${profile.label} 状态`}>
          <ToolPropertyRow
            label="状态"
            value={
              <StatusBadge
                tone={
                  profile.availability === "available" ? "success" : "warning"
                }
              >
                {profile.availability === "available" ? "可用" : "不可用"}
              </StatusBadge>
            }
          />
          <ToolPropertyRow
            label="Provider"
            value={provider?.label ?? profile.providerId}
          />
          <ToolPropertyRow label="模型" value={profile.model} />
          <ToolPropertyRow label="版本" value={profile.version} />
          <ToolPropertyRow
            label="会话上限"
            value={profile.maxResidentSessions}
          />
          <ToolPropertyRow
            label="超时"
            value={`${profile.timeoutMilliseconds} ms`}
          />
        </ToolPropertyList>
      </ToolSection>
      <ToolSection title="符合性">
        <ToolPropertyList aria-label={`${profile.label} 符合性`}>
          <ToolPropertyRow
            label="结果"
            value={
              <StatusBadge
                tone={
                  conformanceStatus === "succeeded"
                    ? "success"
                    : conformanceStatus === "failed"
                      ? "danger"
                      : "neutral"
                }
              >
                {conformanceLabel}
              </StatusBadge>
            }
          />
          {check?.status === "running" ? (
            <ToolPropertyRow label="阶段" value={check.phase} />
          ) : null}
          {check?.errorMessage ? (
            <ToolPropertyRow label="原因" value={check.errorMessage} />
          ) : null}
          {!check?.errorMessage && profile.unavailableReason ? (
            <ToolPropertyRow label="原因" value={profile.unavailableReason} />
          ) : null}
        </ToolPropertyList>
      </ToolSection>
    </ToolSectionStack>
  );
}

export function AgentSettingsStatus({
  state,
  target,
}: {
  state: AgentConfigurationState;
  target: Extract<SettingsTarget, { kind: "provider" | "profile" }>;
}) {
  const configuration = state.configuration;
  if (target.kind === "provider") {
    const provider = configuration?.providers.find(
      ({ id }) => id === target.id,
    );
    return provider ? (
      <ProviderStatus state={state} provider={provider} />
    ) : null;
  }
  const profile = configuration?.profiles.find(({ id }) => id === target.id);
  return profile ? <ProfileStatus state={state} profile={profile} /> : null;
}
