// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState, type FormEvent } from "react";
import type {
  AgentApplication,
  AgentChatReasoningEffort,
  AgentConfigurationState,
  AgentOllamaResidentContext,
  AgentProfileInput,
  AgentProviderInput,
  AgentProviderKind,
  AgentToolCallMode,
} from "../../../application/agent";
import { Button, Panel, PanelBody, PanelHeader, Section } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

const authenticationLabels = {
  configured: "认证已配置",
  missing: "认证未配置",
  "not-required": "无需认证",
  unknown: "认证状态未知",
} as const;

function conformanceLabel(
  check: AgentConfigurationState["conformanceChecks"][string] | undefined,
) {
  if (!check) return null;
  if (check.status === "running") {
    if (check.phase === "calling-tool") {
      return "正在等待模型调用验证工具……";
    }
    if (check.phase === "summarizing") {
      return "工具调用已通过，正在等待自然语言总结……";
    }
    return "验证已通过，正在记录结果……";
  }
  if (check.status === "succeeded") return "符合性检查已通过。";
  if (check.status === "cancelled") return "符合性检查已取消。";
  return `符合性检查失败：${check.errorMessage ?? "未知错误"}`;
}

type ProviderDraft = {
  apiKey: string;
  authenticationType: "bearer" | "none";
  baseUrl: string;
  kind: AgentProviderKind;
  label: string;
  privateNetworkAccessConfirmed: boolean;
};

type ProfileDraft = {
  chatReasoningEffort: AgentChatReasoningEffort;
  historyBudgetCharacters: number;
  label: string;
  maxInputCharacters: number;
  maxOutputCharacters: number;
  maxOutputTokens: number;
  maxResidentSessions: number;
  maxToolSteps: number;
  model: string;
  providerId: string;
  reasoningEffort: "high" | "low" | "medium" | "xhigh";
  timeoutMilliseconds: number;
  toolCallMode: AgentToolCallMode;
};

const emptyProvider = (): ProviderDraft => ({
  apiKey: "",
  authenticationType: "none",
  baseUrl: "http://127.0.0.1:11434",
  kind: "ollama",
  label: "本地 Ollama",
  privateNetworkAccessConfirmed: false,
});

const emptyProfile = (): ProfileDraft => ({
  chatReasoningEffort: "model-default",
  historyBudgetCharacters: 131_072,
  label: "",
  maxInputCharacters: 100_000,
  maxOutputCharacters: 50_000,
  maxOutputTokens: 4_096,
  maxResidentSessions: 1,
  maxToolSteps: 16,
  model: "",
  providerId: "",
  reasoningEffort: "high",
  timeoutMilliseconds: 600_000,
  toolCallMode: "native",
});

function providerInput(draft: ProviderDraft): AgentProviderInput {
  return {
    ...(draft.authenticationType === "bearer" && draft.apiKey
      ? { apiKey: draft.apiKey }
      : {}),
    authenticationType: draft.kind === "codex"
      ? "bearer"
      : draft.authenticationType,
    baseUrl: draft.kind === "codex" ? null : draft.baseUrl,
    kind: draft.kind,
    label: draft.label,
    privateNetworkAccessConfirmed: draft.privateNetworkAccessConfirmed,
  };
}

function profileInput(
  draft: ProfileDraft,
  providerKind: AgentProviderKind,
): AgentProfileInput {
  return {
    label: draft.label,
    maxResidentSessions: draft.maxResidentSessions,
    model: draft.model,
    parameters: providerKind === "codex"
      ? {
          kind: "codex",
          maxInputCharacters: draft.maxInputCharacters,
          maxOutputCharacters: draft.maxOutputCharacters,
          reasoningEffort: draft.reasoningEffort,
        }
      : {
          historyBudgetCharacters: draft.historyBudgetCharacters,
          kind: "chat",
          maxOutputTokens: draft.maxOutputTokens,
          maxToolSteps: draft.maxToolSteps,
          reasoningEffort: draft.chatReasoningEffort,
          toolCallMode: draft.toolCallMode,
        },
    providerId: draft.providerId,
    timeoutMilliseconds: draft.timeoutMilliseconds,
  };
}

export function AgentSettingsPanel({ agent }: { agent: AgentApplication }) {
  const feedback = useFeedback();
  const { configurationController, configurationState, controller, state } =
    agent;
  const configuration = configurationState.configuration;
  const providers = configuration?.providers ?? [];
  const configuredProfiles = configuration?.profiles ?? [];
  const statusProfiles = state.status?.profiles ?? [];
  const [ollamaEndpoint, setOllamaEndpoint] = useState(
    "http://127.0.0.1:11434",
  );
  const [providerDraft, setProviderDraft] = useState(emptyProvider);
  const [profileDraft, setProfileDraft] = useState(emptyProfile);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const selectedProvider = providers.find(({ id }) =>
    id === profileDraft.providerId
  ) ?? null;
  const modelOptions = useMemo(() => [...new Set([
    ...(configurationState.discovery?.models ?? []),
    ...Object.values(configurationState.probes).flatMap(({ models }) => models),
  ])].sort(), [configurationState.discovery, configurationState.probes]);
  const busy = configurationState.operationStatus === "working";

  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    const input = providerInput(providerDraft);

    void feedback.runAction(async () => {
      if (editingProviderId) {
        await configurationController.updateProvider(editingProviderId, input);
      } else {
        await configurationController.createProvider(input);
      }
      setEditingProviderId(null);
      setProviderDraft(emptyProvider());
    });
  };
  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProvider) return;
    const input = profileInput(profileDraft, selectedProvider.kind);

    void feedback.runAction(async () => {
      if (editingProfileId) {
        await configurationController.updateProfile(editingProfileId, input);
      } else {
        await configurationController.createProfile(input);
      }
      setEditingProfileId(null);
      setProfileDraft(emptyProfile());
    });
  };

  return (
    <Panel aria-label="智能体设置" className="settings-panel">
      <PanelHeader title="智能体" />
      <PanelBody scroll>
        <div className="settings-content-column settings-agent-content">
          <p className="settings-muted">
            Provider、Profile、模型参数和凭据均在这里管理。凭据保存后只显示认证状态，不能查看原值。
          </p>
          {configurationState.errorMessage || state.errorMessage ? (
            <p className="settings-api-error" role="alert">
              {configurationState.errorMessage ?? state.errorMessage}
            </p>
          ) : null}
          {state.status?.configurationProblem ? (
            <p className="settings-api-error" role="alert">
              {state.status.configurationProblem}
            </p>
          ) : null}

          <Section title="默认 Profile">
            <label className="settings-agent-profile-selection">
              <span>默认 Profile</span>
              <select
                aria-label="默认 Profile"
                className="ui-input"
                disabled={state.loadStatus === "loading"}
                onChange={(event) =>
                  controller.setPreferredProfile(event.currentTarget.value || null)}
                value={state.preferredProfileId ?? ""}
              >
                <option value="">未选择</option>
                {statusProfiles.map((profile) => (
                  <option
                    disabled={profile.availability !== "available"}
                    key={profile.id}
                    value={profile.id}
                  >
                    {profile.label}
                    {profile.availability === "unavailable" ? "（不可用）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-muted">只影响以后创建的会话；既有会话固定其创建时配置。</p>
          </Section>

          <Section title="发现本地 Ollama">
            <div className="settings-managed-inline-form">
              <input aria-label="Ollama 地址" className="ui-input" onChange={(event) => setOllamaEndpoint(event.currentTarget.value)} value={ollamaEndpoint} />
              <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.discoverOllama(ollamaEndpoint))} type="button">发现本地 Ollama</Button>
            </div>
            {configurationState.discovery ? (
              <p className="settings-muted">
                已发现：{configurationState.discovery.models.join("、") || "没有模型"}。不会自动创建或选择。
              </p>
            ) : null}
          </Section>

          <Section title="Providers">
            {providers.length === 0 ? (
              <p className="settings-muted">尚未创建 Provider。</p>
            ) : (
              <ul className="settings-agent-card-list">
                {providers.map((provider) => (
                  <li key={provider.id}>
                    <div>
                      <strong>{provider.label}</strong>
                      <p>{provider.kind} · {provider.baseUrl ?? "Codex app-server"} · {authenticationLabels[provider.authenticationStatus]}</p>
                      <p>私网许可：{provider.privateNetworkAccess === "confirmed" ? "已确认当前地址" : "不需要"}</p>
                      {configurationState.probes[provider.id] ? <>
                        <p>探测模型：{configurationState.probes[provider.id]!.models.join("、") || "无"}</p>
                        <p>探测时间：{configurationState.probes[provider.id]!.probedAt}</p>
                        {configurationState.probes[provider.id]!.modelContexts.map((context) => (
                          <p key={context.model}>
                            {context.model} · 模型架构上限：{context.declaredMaximumContextTokens === null ? "未知" : `${context.declaredMaximumContextTokens} tokens`} · 当前驻留上下文：{residentContextLabel(context.residentContext)}
                          </p>
                        ))}
                      </> : null}
                    </div>
                    <div className="ui-actions">
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.probeProvider(provider.id))} type="button">探测</Button>
                      <Button disabled={busy} onClick={() => {
                        setEditingProviderId(provider.id);
                        setProviderDraft({
                          apiKey: "",
                          authenticationType: provider.authenticationStatus === "not-required" ? "none" : "bearer",
                          baseUrl: provider.baseUrl ?? "",
                          kind: provider.kind,
                          label: provider.label,
                          privateNetworkAccessConfirmed: provider.privateNetworkAccess === "confirmed",
                        });
                      }} type="button">编辑</Button>
                      {provider.authenticationStatus !== "not-required" ? (
                        <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.updateProvider(provider.id, {
                          apiKey: null,
                          authenticationType: "bearer",
                          baseUrl: provider.baseUrl,
                          kind: provider.kind,
                          label: provider.label,
                          privateNetworkAccessConfirmed: provider.privateNetworkAccess === "confirmed",
                        }))} type="button">清除凭据</Button>
                      ) : null}
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.deleteProvider(provider.id))} type="button">删除</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form className="settings-managed-form" onSubmit={submitProvider}>
              <label><span>名称</span><input aria-label="Provider 名称" className="ui-input" onChange={(event) => setProviderDraft({ ...providerDraft, label: event.currentTarget.value })} required value={providerDraft.label} /></label>
              <label><span>类型</span><select aria-label="Provider 类型" className="ui-input" onChange={(event) => {
                const kind = event.currentTarget.value as AgentProviderKind;
                setProviderDraft({
                  ...providerDraft,
                  authenticationType: kind === "ollama" ? "none" : "bearer",
                  baseUrl: kind === "ollama" ? "http://127.0.0.1:11434" : kind === "codex" ? "" : providerDraft.baseUrl,
                  kind,
                  privateNetworkAccessConfirmed: false,
                });
              }} value={providerDraft.kind}><option value="ollama">Ollama</option><option value="openai-chat">OpenAI-compatible</option><option value="codex">Codex</option></select></label>
              {providerDraft.kind !== "codex" ? <label><span>地址</span><input aria-label="Provider 地址" className="ui-input" onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.currentTarget.value, privateNetworkAccessConfirmed: false })} required value={providerDraft.baseUrl} /></label> : null}
              {providerDraft.kind !== "codex" ? <label><span>认证</span><select aria-label="Provider 认证" className="ui-input" onChange={(event) => setProviderDraft({ ...providerDraft, authenticationType: event.currentTarget.value as "bearer" | "none" })} value={providerDraft.authenticationType}><option value="none">无需认证</option><option value="bearer">Bearer</option></select></label> : null}
              {(providerDraft.kind === "codex" || providerDraft.authenticationType === "bearer") ? <label><span>API Key</span><input aria-label="Provider API Key" autoComplete="new-password" className="ui-input" onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.currentTarget.value })} placeholder={editingProviderId ? "留空则保留现有凭据" : "一次性写入"} required={!editingProviderId} type="password" value={providerDraft.apiKey} /></label> : null}
              {providerDraft.kind !== "codex" ? <label><input aria-label="确认 Provider 私网访问" checked={providerDraft.privateNetworkAccessConfirmed} onChange={(event) => setProviderDraft({ ...providerDraft, privateNetworkAccessConfirmed: event.currentTarget.checked })} type="checkbox" /><span>明确允许当前地址访问非 loopback 私网；修改地址后必须重新确认</span></label> : null}
              <div className="settings-managed-form-actions"><Button disabled={busy} type="submit" variant="primary">{editingProviderId ? "保存 Provider" : "创建 Provider"}</Button>{editingProviderId ? <Button onClick={() => { setEditingProviderId(null); setProviderDraft(emptyProvider()); }} type="button">取消</Button> : null}</div>
            </form>
          </Section>

          <Section title="Profiles">
            {configuredProfiles.length === 0 ? <p className="settings-muted">尚未创建 Profile。</p> : (
              <ul className="settings-agent-card-list">
                {configuredProfiles.map((profile) => {
                  const conformance = configurationState.conformanceChecks[profile.id];
                  const conformanceMessage = conformanceLabel(conformance);

                  return <li key={profile.id}>
                    <div><strong>{profile.label}</strong><p>{profile.model} · v{profile.version} · {profile.availability === "available" ? "可用" : profile.unavailableReason}</p></div>
                    <div className="ui-actions">
                      {profile.parameters.kind === "chat" ? conformance?.status === "running"
                        ? <Button disabled={conformance.phase === "recording-result"} onClick={() => void feedback.runAction(() => configurationController.cancelConformance(profile.id))} type="button">{conformance.phase === "recording-result" ? "正在记录" : "取消检查"}</Button>
                        : <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.checkConformance(profile.id))} type="button">符合性检查</Button>
                        : null}
                      <Button disabled={busy} onClick={() => {
                        setEditingProfileId(profile.id);
                        setProfileDraft({
                          chatReasoningEffort: profile.parameters.kind === "chat" ? profile.parameters.reasoningEffort : "model-default",
                          historyBudgetCharacters: profile.parameters.kind === "chat" ? profile.parameters.historyBudgetCharacters : 131_072,
                          label: profile.label,
                          maxInputCharacters: profile.parameters.kind === "codex" ? profile.parameters.maxInputCharacters : 100_000,
                          maxOutputCharacters: profile.parameters.kind === "codex" ? profile.parameters.maxOutputCharacters : 50_000,
                          maxOutputTokens: profile.parameters.kind === "chat" ? profile.parameters.maxOutputTokens : 4_096,
                          maxResidentSessions: profile.maxResidentSessions,
                          maxToolSteps: profile.parameters.kind === "chat" ? profile.parameters.maxToolSteps : 16,
                          model: profile.model,
                          providerId: profile.providerId,
                          reasoningEffort: profile.parameters.kind === "codex" ? profile.parameters.reasoningEffort : "high",
                          timeoutMilliseconds: profile.timeoutMilliseconds,
                          toolCallMode: profile.parameters.kind === "chat" ? profile.parameters.toolCallMode : "native",
                        });
                      }} type="button">编辑</Button>
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.deleteProfile(profile.id))} type="button">删除</Button>
                    </div>
                    {conformanceMessage ? <p aria-live="polite" role="status">{conformanceMessage}</p> : null}
                  </li>;
                })}
              </ul>
            )}
            <form className="settings-managed-form" onSubmit={submitProfile}>
              <label><span>Provider</span><select aria-label="Profile Provider" className="ui-input" onChange={(event) => setProfileDraft({ ...profileDraft, providerId: event.currentTarget.value })} required value={profileDraft.providerId}><option value="">请选择</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label><span>名称</span><input aria-label="Profile 名称" className="ui-input" onChange={(event) => setProfileDraft({ ...profileDraft, label: event.currentTarget.value })} required value={profileDraft.label} /></label>
              <label><span>模型</span><input aria-label="Profile 模型" className="ui-input" list="agent-model-options" onChange={(event) => setProfileDraft({ ...profileDraft, model: event.currentTarget.value })} required value={profileDraft.model} /><datalist id="agent-model-options">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist></label>
              <label><span>会话上限</span><input aria-label="Profile 会话上限" className="ui-input" min="1" onChange={(event) => setProfileDraft({ ...profileDraft, maxResidentSessions: event.currentTarget.valueAsNumber })} required type="number" value={profileDraft.maxResidentSessions} /></label>
              <label><span>超时毫秒</span><input aria-label="Profile 超时" className="ui-input" min="1" onChange={(event) => setProfileDraft({ ...profileDraft, timeoutMilliseconds: event.currentTarget.valueAsNumber })} required type="number" value={profileDraft.timeoutMilliseconds} /></label>
              {selectedProvider?.kind === "codex" ? <CodexProfileFields draft={profileDraft} setDraft={setProfileDraft} /> : selectedProvider ? <ChatProfileFields draft={profileDraft} providerKind={selectedProvider.kind} setDraft={setProfileDraft} /> : null}
              <div className="settings-managed-form-actions"><Button disabled={busy || !selectedProvider} type="submit" variant="primary">{editingProfileId ? "保存 Profile" : "创建 Profile"}</Button>{editingProfileId ? <Button onClick={() => { setEditingProfileId(null); setProfileDraft(emptyProfile()); }} type="button">取消</Button> : null}</div>
            </form>
          </Section>

          <Section title="操作">
            <Button disabled={busy || state.operationStatus === "working"} onClick={() => void feedback.runAction(async () => { await configurationController.load(); await controller.refreshStatus(); })} type="button">刷新状态</Button>
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}

function residentContextLabel(
  context: AgentOllamaResidentContext,
) {
  if (context.status === "not-loaded") return "未加载，无法测量实际值";
  if (context.status === "loaded-unreported") return "已加载，但 Ollama 未报告实际值";
  return `${context.allocatedContextTokens} tokens`;
}

function CodexProfileFields({ draft, setDraft }: { draft: ProfileDraft; setDraft(value: ProfileDraft): void }) {
  return <>
    <label><span>推理强度</span><select aria-label="Profile 推理强度" className="ui-input" onChange={(event) => setDraft({ ...draft, reasoningEffort: event.currentTarget.value as ProfileDraft["reasoningEffort"] })} value={draft.reasoningEffort}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label>
    <label><span>输入字符</span><input aria-label="Profile 输入字符" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, maxInputCharacters: event.currentTarget.valueAsNumber })} type="number" value={draft.maxInputCharacters} /></label>
    <label><span>输出字符</span><input aria-label="Profile 输出字符" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, maxOutputCharacters: event.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputCharacters} /></label>
  </>;
}

function ChatProfileFields({ draft, providerKind, setDraft }: { draft: ProfileDraft; providerKind: AgentProviderKind; setDraft(value: ProfileDraft): void }) {
  return <>
    <label><span>工具模式</span><select aria-label="Profile 工具模式" className="ui-input" onChange={(event) => setDraft({ ...draft, toolCallMode: event.currentTarget.value as AgentToolCallMode })} value={draft.toolCallMode}><option value="native">native</option>{providerKind === "ollama" ? <option value="single-json">single-json</option> : null}</select></label>
    {providerKind === "ollama" ? <label><span>推理强度</span><select aria-label="Profile Chat 推理强度" className="ui-input" onChange={(event) => setDraft({ ...draft, chatReasoningEffort: event.currentTarget.value as AgentChatReasoningEffort })} value={draft.chatReasoningEffort}><option value="model-default">模型默认</option><option value="none">关闭</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label> : null}
    <label><span>会话历史预算（字符）</span><input aria-label="Profile 会话历史预算（字符）" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, historyBudgetCharacters: event.currentTarget.valueAsNumber })} type="number" value={draft.historyBudgetCharacters} /></label>
    <p className="settings-muted">仅控制 Cognition Tree 何时压缩内存对话；不会修改 Ollama num_ctx，也不代表模型的真实 token 上限。</p>
    <label><span>输出 tokens</span><input aria-label="Profile 输出 Tokens" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, maxOutputTokens: event.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputTokens} /></label>
    <label><span>工具步数</span><input aria-label="Profile 工具步数" className="ui-input" min="3" onChange={(event) => setDraft({ ...draft, maxToolSteps: event.currentTarget.valueAsNumber })} type="number" value={draft.maxToolSteps} /></label>
  </>;
}
