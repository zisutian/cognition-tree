// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Stack as SectionStack,
  StatusText as StatusBadge,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import { Section } from "compact-ui";

import type {
  AgentConfigurationState,
  AgentOllamaResidentContext,
  AgentProfileView,
  AgentProviderView,
} from "../../../application/agent/index.ts";

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
    <SectionStack>
      <Section>
        <section aria-label={`${provider.label} 状态`}>
          <ToolPropertyList>
            <ToolPropertyRow label="类型" children={provider.kind} />
            <ToolPropertyRow
              label="认证"
              children={
                <StatusBadge
                  mode="live"
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
              children={<code>{provider.baseUrl ?? "Codex app-server"}</code>}
            />
            <ToolPropertyRow label="版本" children={provider.version} />
            <ToolPropertyRow
              label="私网许可"
              children={
                provider.privateNetworkAccess === "confirmed"
                  ? "已允许"
                  : "不需要"
              }
            />
          </ToolPropertyList>
        </section>
      </Section>
      {probe ? (
        <Section title="最近探测">
          <section aria-label={`${provider.label} 探测状态`}>
            <ToolPropertyList>
              <ToolPropertyRow
                label="连接"
                children={probe.reachable ? "可达" : "不可达"}
              />
              <ToolPropertyRow
                label="探测时间"
                children={new Date(probe.probedAt).toLocaleString()}
              />
              <ToolPropertyRow
                label="模型"
                children={probe.models.join("、") || "无"}
              />
              {probe.modelContexts.map((context) => (
                <ToolPropertyRow
                  key={context.model}
                  label={context.model}
                  children={`上限 ${context.declaredMaximumContextTokens ?? "未知"} · 驻留 ${residentContextLabel(context.residentContext)}`}
                />
              ))}
            </ToolPropertyList>
          </section>
        </Section>
      ) : null}
    </SectionStack>
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
    <SectionStack>
      <Section>
        <section aria-label={`${profile.label} 状态`}>
          <ToolPropertyList>
            <ToolPropertyRow
              label="状态"
              children={
                <StatusBadge
                  mode="live"
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
              children={provider?.label ?? profile.providerId}
            />
            <ToolPropertyRow label="模型" children={profile.model} />
            <ToolPropertyRow label="版本" children={profile.version} />
            <ToolPropertyRow
              label="会话上限"
              children={profile.maxResidentSessions}
            />
            <ToolPropertyRow
              label="超时"
              children={`${profile.timeoutMilliseconds} ms`}
            />
          </ToolPropertyList>
        </section>
      </Section>
      <Section title="符合性">
        <section aria-label={`${profile.label} 符合性`}>
          <ToolPropertyList>
            <ToolPropertyRow
              label="结果"
              children={
                <StatusBadge
                  mode="live"
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
              <ToolPropertyRow label="阶段" children={check.phase} />
            ) : null}
            {check?.errorMessage ? (
              <ToolPropertyRow label="原因" children={check.errorMessage} />
            ) : null}
            {!check?.errorMessage && profile.unavailableReason ? (
              <ToolPropertyRow
                label="原因"
                children={profile.unavailableReason}
              />
            ) : null}
          </ToolPropertyList>
        </section>
      </Section>
    </SectionStack>
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
