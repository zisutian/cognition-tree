// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AgentApplication,
  AgentChatReasoningEffort,
  AgentConfigurationState,
  AgentOllamaResidentContext,
  AgentProfileInput,
  AgentProfileView,
  AgentProviderAuthenticationType,
  AgentProviderInput,
  AgentProviderKind,
  AgentProviderView,
  AgentToolCallMode,
} from "../../../application/agent";
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
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../ui/shared/primitives";
import {
  StatusBadge,
  StatusSummary,
} from "../../ui/shared/StatusPresentation";
import { SubsectionTabs } from "../../ui/shared/SubsectionTabs";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

export type AgentSettingsPage = "overview" | "profiles" | "providers";

const agentSettingsTabs = [
  { label: "概览", value: "overview" },
  { label: "Provider", value: "providers" },
  { label: "Profile", value: "profiles" },
] as const;

const authenticationLabels = {
  configured: "认证已配置",
  missing: "认证未配置",
  "not-required": "无需认证",
  unknown: "认证状态未知",
} as const;

const authenticationTypeLabels: Record<
  AgentProviderAuthenticationType,
  string
> = {
  "api-key": "API Key",
  "chatgpt-device-code": "ChatGPT 设备码",
  none: "无需认证",
};

type ProviderDraft = {
  apiKey: string;
  authenticationType: AgentProviderAuthenticationType;
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
    ...(draft.authenticationType === "api-key" && draft.apiKey
      ? { apiKey: draft.apiKey }
      : {}),
    authenticationType: draft.authenticationType,
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

export function AgentSettingsPanel({
  agent,
  onPageChange,
  page,
}: {
  agent: AgentApplication;
  onPageChange(page: AgentSettingsPage): void;
  page: AgentSettingsPage;
}) {
  const feedback = useFeedback();
  const { configurationController, configurationState, controller, state } =
    agent;
  const configuration = configurationState.configuration;
  const providers = configuration?.providers ?? [];
  const profiles = configuration?.profiles ?? [];
  const statusProfiles = state.status?.profiles ?? [];
  const [ollamaEndpoint, setOllamaEndpoint] = useState(
    "http://127.0.0.1:11434",
  );
  const [providerDraft, setProviderDraft] = useState(emptyProvider);
  const [profileDraft, setProfileDraft] = useState(emptyProfile);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
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
  const providerFormVisible = creatingProvider || editingProviderId !== null;
  const profileFormVisible = creatingProfile || editingProfileId !== null;
  const resetProviderForm = () => {
    setCreatingProvider(false);
    setEditingProviderId(null);
    setProviderDraft(emptyProvider());
  };
  const resetProfileForm = () => {
    setCreatingProfile(false);
    setEditingProfileId(null);
    setProfileDraft(emptyProfile());
  };
  const changePage = (nextPage: AgentSettingsPage) => {
    resetProviderForm();
    resetProfileForm();
    onPageChange(nextPage);
  };
  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    const input = providerInput(providerDraft);

    void feedback.runAction(async () => {
      if (editingProviderId) {
        await configurationController.updateProvider(editingProviderId, input);
      } else {
        await configurationController.createProvider(input);
      }
      resetProviderForm();
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
      resetProfileForm();
    });
  };
  const refresh = () => void feedback.runAction(async () => {
    await configurationController.load();
    await controller.refreshStatus();
  });

  return (
    <Panel aria-label="智能体设置" className="settings-panel">
      <PanelHeader
        actions={(
          <Button
            disabled={busy || state.operationStatus === "working"}
            onClick={refresh}
            type="button"
          >
            刷新状态
          </Button>
        )}
        title="智能体"
      />
      <PanelBody scroll>
        <div className="settings-content-column settings-agent-content">
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
          <SubsectionTabs
            ariaLabel="智能体设置页面"
            onChange={changePage}
            options={agentSettingsTabs}
            value={page}
          >
            {page === "overview" ? (
              <AgentOverview
                agent={agent}
                busy={busy}
                ollamaEndpoint={ollamaEndpoint}
                onEndpointChange={setOllamaEndpoint}
                onPageChange={changePage}
                profiles={profiles}
                providers={providers}
                statusProfiles={statusProfiles}
              />
            ) : page === "providers" ? (
              <ProviderManagement
                agent={agent}
                busy={busy}
                draft={providerDraft}
                editingProviderId={editingProviderId}
                formVisible={providerFormVisible}
                onBeginCreate={() => {
                  resetProviderForm();
                  setCreatingProvider(true);
                }}
                onCancel={resetProviderForm}
                onDraftChange={setProviderDraft}
                onEdit={(provider) => {
                  setCreatingProvider(false);
                  setEditingProviderId(provider.id);
                  setProviderDraft({
                    apiKey: "",
                    authenticationType: provider.authenticationType,
                    baseUrl: provider.baseUrl ?? "",
                    kind: provider.kind,
                    label: provider.label,
                    privateNetworkAccessConfirmed:
                      provider.privateNetworkAccess === "confirmed",
                  });
                }}
                onSubmit={submitProvider}
                providers={providers}
              />
            ) : (
              <ProfileManagement
                agent={agent}
                busy={busy}
                draft={profileDraft}
                editingProfileId={editingProfileId}
                formVisible={profileFormVisible}
                modelOptions={modelOptions}
                onBeginCreate={() => {
                  resetProfileForm();
                  setCreatingProfile(true);
                }}
                onCancel={resetProfileForm}
                onDraftChange={setProfileDraft}
                onEdit={(profile) => {
                  setCreatingProfile(false);
                  setEditingProfileId(profile.id);
                  setProfileDraft(profileDraftFrom(profile));
                }}
                onSubmit={submitProfile}
                profiles={profiles}
                providers={providers}
                selectedProvider={selectedProvider}
              />
            )}
          </SubsectionTabs>
        </div>
      </PanelBody>
    </Panel>
  );
}

function AgentOverview({
  agent,
  busy,
  ollamaEndpoint,
  onEndpointChange,
  onPageChange,
  profiles,
  providers,
  statusProfiles,
}: {
  agent: AgentApplication;
  busy: boolean;
  ollamaEndpoint: string;
  onEndpointChange(value: string): void;
  onPageChange(page: AgentSettingsPage): void;
  profiles: readonly AgentProfileView[];
  providers: readonly AgentProviderView[];
  statusProfiles: NonNullable<AgentApplication["state"]["status"]>["profiles"];
}) {
  const feedback = useFeedback();
  const preferred = statusProfiles.find(({ id }) =>
    id === agent.state.preferredProfileId
  ) ?? null;

  return (
    <div className="settings-agent-page">
      <StatusSummary
        ariaLabel="Agent 状态概览"
        items={[
          {
            label: "Agent",
            value: (
              <StatusBadge tone={agent.state.status?.enabled ? "success" : "warning"}>
                {agent.state.status?.enabled ? "可用" : "不可用"}
              </StatusBadge>
            ),
          },
          { label: "默认 Profile", value: preferred?.label ?? "未选择" },
          { label: "Provider", value: providers.length },
          { label: "Profile", value: profiles.length },
        ]}
      />
      <Section title="默认 Profile">
        <FormLayout>
          <FieldRow
            description="只影响以后创建的会话；既有会话固定其创建时配置。"
            fieldId="settings-agent-default-profile"
            label="默认 Profile"
          >
            {(accessibility) => (
              <select
                {...accessibility}
                aria-label="默认 Profile"
                className="ui-input"
                disabled={agent.state.loadStatus === "loading"}
                onChange={(event) => agent.controller.setPreferredProfile(
                  event.currentTarget.value || null,
                )}
                value={agent.state.preferredProfileId ?? ""}
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
            )}
          </FieldRow>
        </FormLayout>
      </Section>
      <Section title="发现本地 Ollama">
        <FormLayout>
          <FieldRow
            description="发现只读取模型列表，不会自动创建 Provider 或 Profile。"
            fieldId="settings-agent-ollama-endpoint"
            label="Ollama 地址"
          >
            {(accessibility) => (
              <input
                {...accessibility}
                aria-label="Ollama 地址"
                className="ui-input"
                onChange={(event) => onEndpointChange(event.currentTarget.value)}
                value={ollamaEndpoint}
              />
            )}
          </FieldRow>
          <FormActions>
            <Button
              disabled={busy}
              onClick={() => void feedback.runAction(() =>
                agent.configurationController.discoverOllama(ollamaEndpoint)
              )}
              type="button"
            >
              发现本地 Ollama
            </Button>
          </FormActions>
        </FormLayout>
        {agent.configurationState.discovery ? (
          <StatusSummary
            ariaLabel="Ollama 发现结果"
            items={[
              { label: "地址", value: agent.configurationState.discovery.endpoint },
              {
                label: "模型",
                value: agent.configurationState.discovery.models.join("、") || "没有模型",
              },
            ]}
          />
        ) : null}
      </Section>
      <div className="settings-agent-overview-links">
        <Button onClick={() => onPageChange("providers")} type="button">
          管理 Provider
        </Button>
        <Button onClick={() => onPageChange("profiles")} type="button">
          管理 Profile
        </Button>
      </div>
    </div>
  );
}

function ProviderManagement({
  agent,
  busy,
  draft,
  editingProviderId,
  formVisible,
  onBeginCreate,
  onCancel,
  onDraftChange,
  onEdit,
  onSubmit,
  providers,
}: {
  agent: AgentApplication;
  busy: boolean;
  draft: ProviderDraft;
  editingProviderId: string | null;
  formVisible: boolean;
  onBeginCreate(): void;
  onCancel(): void;
  onDraftChange(draft: ProviderDraft): void;
  onEdit(provider: AgentProviderView): void;
  onSubmit(event: FormEvent): void;
  providers: readonly AgentProviderView[];
}) {
  const feedback = useFeedback();

  if (formVisible) {
    return (
      <div className="settings-agent-page">
        <SettingsPageHeading
          title={editingProviderId ? "编辑 Provider" : "新建 Provider"}
        />
        <ProviderForm
          busy={busy}
          draft={draft}
          editing={editingProviderId !== null}
          onCancel={onCancel}
          onChange={onDraftChange}
          onSubmit={onSubmit}
        />
      </div>
    );
  }

  return (
    <div className="settings-agent-page">
      <SettingsPageHeading
        action={(
          <Button onClick={onBeginCreate} type="button" variant="primary">
            新建 Provider
          </Button>
        )}
        title="Provider"
      />
      {providers.length === 0 ? (
        <EmptyState compact description="Provider 保存模型服务地址和认证方式。" title="尚未创建 Provider" />
      ) : (
        <ManagementList aria-label="Provider 列表">
          {providers.map((provider) => {
            const probe = agent.configurationState.probes[provider.id];
            const login = agent.configurationState.codexDeviceLogins[provider.id];

            return (
              <ManagementRow
                actions={(
                  <>
                    <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.probeProvider(provider.id))} type="button">探测</Button>
                    {provider.kind === "codex" && provider.authenticationType === "chatgpt-device-code" && login?.status !== "pending" ? (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.startCodexDeviceLogin(provider.id))} type="button">使用 ChatGPT 登录</Button>
                    ) : null}
                    {provider.authenticationStatus === "configured" ? (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.clearProviderAuthentication(provider.id))} type="button">退出认证</Button>
                    ) : null}
                    <Button disabled={busy} onClick={() => onEdit(provider)} type="button">编辑</Button>
                    <Button className="settings-danger-action" disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.deleteProvider(provider.id))} type="button">删除</Button>
                  </>
                )}
                description={`${provider.kind} · ${provider.baseUrl ?? "Codex app-server"} · ${authenticationTypeLabels[provider.authenticationType]} · 私网许可${provider.privateNetworkAccess === "confirmed" ? "已确认" : "不需要"}`}
                key={provider.id}
                status={<StatusBadge tone={provider.authenticationStatus === "missing" ? "warning" : "success"}>{authenticationLabels[provider.authenticationStatus]}</StatusBadge>}
                title={`${provider.label} · v${provider.version}`}
              >
                {login?.status === "pending" ? (
                  <div className="settings-device-login" role="status">
                    <a href={login.verificationUrl} rel="noreferrer" target="_blank">打开 ChatGPT 登录</a>
                    <span>设备码：{login.userCode}</span>
                    <Button onClick={() => void feedback.runAction(() => agent.configurationController.cancelCodexDeviceLogin(provider.id))} type="button">取消登录</Button>
                  </div>
                ) : null}
                {probe ? <ProviderProbeDetails probe={probe} provider={provider} /> : null}
              </ManagementRow>
            );
          })}
        </ManagementList>
      )}
    </div>
  );
}

function ProfileManagement({
  agent,
  busy,
  draft,
  editingProfileId,
  formVisible,
  modelOptions,
  onBeginCreate,
  onCancel,
  onDraftChange,
  onEdit,
  onSubmit,
  profiles,
  providers,
  selectedProvider,
}: {
  agent: AgentApplication;
  busy: boolean;
  draft: ProfileDraft;
  editingProfileId: string | null;
  formVisible: boolean;
  modelOptions: readonly string[];
  onBeginCreate(): void;
  onCancel(): void;
  onDraftChange(draft: ProfileDraft): void;
  onEdit(profile: AgentProfileView): void;
  onSubmit(event: FormEvent): void;
  profiles: readonly AgentProfileView[];
  providers: readonly AgentProviderView[];
  selectedProvider: AgentProviderView | null;
}) {
  const feedback = useFeedback();
  const providerLabels = new Map(providers.map(({ id, label }) => [id, label]));

  if (formVisible) {
    return (
      <div className="settings-agent-page">
        <SettingsPageHeading title={editingProfileId ? "编辑 Profile" : "新建 Profile"} />
        <ProfileForm busy={busy} draft={draft} editing={editingProfileId !== null} modelOptions={modelOptions} onCancel={onCancel} onChange={onDraftChange} onSubmit={onSubmit} providers={providers} selectedProvider={selectedProvider} />
      </div>
    );
  }

  return (
    <div className="settings-agent-page">
      <SettingsPageHeading action={<Button onClick={onBeginCreate} type="button" variant="primary">新建 Profile</Button>} title="Profile" />
      {profiles.length === 0 ? (
        <EmptyState compact description="Profile 固定 Provider、模型和推理限制。" title="尚未创建 Profile" />
      ) : (
        <ManagementList aria-label="Profile 列表">
          {profiles.map((profile) => {
            const check = agent.configurationState.conformanceChecks[profile.id];
            const running = check?.status === "running";

            return (
              <ManagementRow
                actions={(
                  <>
                    {profile.parameters.kind === "chat" ? running ? (
                      <Button disabled={check.phase === "recording-result"} onClick={() => void feedback.runAction(() => agent.configurationController.cancelConformance(profile.id))} type="button">{check.phase === "recording-result" ? "正在记录" : "取消检查"}</Button>
                    ) : (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.checkConformance(profile.id))} type="button">符合性检查</Button>
                    ) : null}
                    <Button disabled={busy} onClick={() => onEdit(profile)} type="button">编辑</Button>
                    <Button className="settings-danger-action" disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.deleteProfile(profile.id))} type="button">删除</Button>
                  </>
                )}
                description={`${profile.model} · ${providerLabels.get(profile.providerId) ?? profile.providerId} · v${profile.version}`}
                key={profile.id}
                status={<StatusBadge tone={profile.availability === "available" ? "success" : "warning"}>{profile.availability === "available" ? "可用" : "不可用"}</StatusBadge>}
                title={profile.label}
              >
                <ProfileConformanceDetails check={check} profile={profile} />
              </ManagementRow>
            );
          })}
        </ManagementList>
      )}
    </div>
  );
}

function SettingsPageHeading({ action, title }: { action?: ReactNode; title: string }) {
  return <div className="settings-page-heading"><h3>{title}</h3>{action ? <div className="ui-actions">{action}</div> : null}</div>;
}

function ProviderForm({ busy, draft, editing, onCancel, onChange, onSubmit }: { busy: boolean; draft: ProviderDraft; editing: boolean; onCancel(): void; onChange(draft: ProviderDraft): void; onSubmit(event: FormEvent): void }) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-provider-name" label="名称">{(a) => <input {...a} aria-label="Provider 名称" className="ui-input" onChange={(e) => onChange({ ...draft, label: e.currentTarget.value })} required value={draft.label} />}</FieldRow>
        <FieldRow fieldId="settings-provider-kind" label="类型">{(a) => <select {...a} aria-label="Provider 类型" className="ui-input" onChange={(e) => { const kind = e.currentTarget.value as AgentProviderKind; onChange({ ...draft, authenticationType: kind === "ollama" ? "none" : "api-key", baseUrl: kind === "ollama" ? "http://127.0.0.1:11434" : kind === "codex" ? "" : draft.baseUrl, kind, privateNetworkAccessConfirmed: false }); }} value={draft.kind}><option value="ollama">Ollama</option><option value="openai-chat">OpenAI-compatible</option><option value="codex">Codex</option></select>}</FieldRow>
        {draft.kind !== "codex" ? <FieldRow fieldId="settings-provider-address" label="地址">{(a) => <input {...a} aria-label="Provider 地址" className="ui-input" onChange={(e) => onChange({ ...draft, baseUrl: e.currentTarget.value, privateNetworkAccessConfirmed: false })} required value={draft.baseUrl} />}</FieldRow> : null}
        <FieldRow fieldId="settings-provider-authentication" label="认证">{(a) => <select {...a} aria-label="Provider 认证" className="ui-input" onChange={(e) => onChange({ ...draft, authenticationType: e.currentTarget.value as AgentProviderAuthenticationType })} value={draft.authenticationType}>{draft.kind === "codex" ? <><option value="api-key">API Key</option><option value="chatgpt-device-code">ChatGPT 设备码</option></> : <><option value="none">无需认证</option><option value="api-key">API Key</option></>}</select>}</FieldRow>
        {draft.authenticationType === "api-key" ? <FieldRow description={editing ? "留空则保留现有凭据。" : "凭据只写入一次，保存后不回显。"} fieldId="settings-provider-api-key" label="API Key">{(a) => <input {...a} aria-label="Provider API Key" autoComplete="new-password" className="ui-input" onChange={(e) => onChange({ ...draft, apiKey: e.currentTarget.value })} required={!editing} type="password" value={draft.apiKey} />}</FieldRow> : null}
        {draft.kind !== "codex" ? <FieldRow description="修改地址后必须重新确认。loopback 地址不需要许可。" fieldId="settings-provider-private-network" label="私网许可">{(a) => <label className="settings-checkbox-control"><input {...a} aria-label="确认 Provider 私网访问" checked={draft.privateNetworkAccessConfirmed} onChange={(e) => onChange({ ...draft, privateNetworkAccessConfirmed: e.currentTarget.checked })} type="checkbox" /><span>明确允许当前地址访问非 loopback 私网</span></label>}</FieldRow> : null}
        <FormActions><Button disabled={busy} type="submit" variant="primary">{editing ? "保存 Provider" : "创建 Provider"}</Button><Button onClick={onCancel} type="button">取消</Button></FormActions>
      </FormLayout>
    </form>
  );
}

function ProfileForm({ busy, draft, editing, modelOptions, onCancel, onChange, onSubmit, providers, selectedProvider }: { busy: boolean; draft: ProfileDraft; editing: boolean; modelOptions: readonly string[]; onCancel(): void; onChange(draft: ProfileDraft): void; onSubmit(event: FormEvent): void; providers: readonly AgentProviderView[]; selectedProvider: AgentProviderView | null }) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-profile-provider" label="Provider">{(a) => <select {...a} aria-label="Profile Provider" className="ui-input" onChange={(e) => onChange({ ...draft, providerId: e.currentTarget.value })} required value={draft.providerId}><option value="">请选择</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select>}</FieldRow>
        <FieldRow fieldId="settings-profile-name" label="名称">{(a) => <input {...a} aria-label="Profile 名称" className="ui-input" onChange={(e) => onChange({ ...draft, label: e.currentTarget.value })} required value={draft.label} />}</FieldRow>
        <FieldRow fieldId="settings-profile-model" label="模型">{(a) => <><input {...a} aria-label="Profile 模型" className="ui-input" list="agent-model-options" onChange={(e) => onChange({ ...draft, model: e.currentTarget.value })} required value={draft.model} /><datalist id="agent-model-options">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist></>}</FieldRow>
        <FieldRow fieldId="settings-profile-session-limit" label="会话上限">{(a) => <input {...a} aria-label="Profile 会话上限" className="ui-input" min="1" onChange={(e) => onChange({ ...draft, maxResidentSessions: e.currentTarget.valueAsNumber })} required type="number" value={draft.maxResidentSessions} />}</FieldRow>
        <FieldRow fieldId="settings-profile-timeout" label="超时毫秒">{(a) => <input {...a} aria-label="Profile 超时" className="ui-input" min="1" onChange={(e) => onChange({ ...draft, timeoutMilliseconds: e.currentTarget.valueAsNumber })} required type="number" value={draft.timeoutMilliseconds} />}</FieldRow>
        {selectedProvider?.kind === "codex" ? <CodexProfileFields draft={draft} setDraft={onChange} /> : selectedProvider ? <ChatProfileFields draft={draft} providerKind={selectedProvider.kind} setDraft={onChange} /> : null}
        <FormActions><Button disabled={busy || !selectedProvider} type="submit" variant="primary">{editing ? "保存 Profile" : "创建 Profile"}</Button><Button onClick={onCancel} type="button">取消</Button></FormActions>
      </FormLayout>
    </form>
  );
}

function ProviderProbeDetails({ probe, provider }: { probe: AgentConfigurationState["probes"][string]; provider: AgentProviderView }) {
  return (
    <div className="settings-agent-structured-status">
      <StatusSummary ariaLabel={`${provider.label} 探测状态`} items={[{ label: "连接", value: probe.reachable ? "可达" : "不可达" }, { label: "探测时间", value: new Date(probe.probedAt).toLocaleString() }, { label: "模型", value: probe.models.join("、") || "无" }]} />
      {probe.modelContexts.length > 0 ? <dl className="settings-agent-context-list">{probe.modelContexts.map((context) => <div key={context.model}><dt>{context.model}</dt><dd>模型架构上限：{context.declaredMaximumContextTokens === null ? "未知" : `${context.declaredMaximumContextTokens} tokens`} · 当前驻留上下文：{residentContextLabel(context.residentContext)}</dd></div>)}</dl> : null}
    </div>
  );
}

function ProfileConformanceDetails({ check, profile }: { check: AgentConfigurationState["conformanceChecks"][string] | undefined; profile: AgentProfileView }) {
  const phaseLabels = { "calling-tool": "调用验证工具", "recording-result": "记录验证结果", summarizing: "生成自然语言总结" } as const;
  const status = check?.status ?? (profile.conformance ? "succeeded" : "not-run");
  const statusLabel = status === "running" ? "检查中" : status === "succeeded" ? "已通过" : status === "failed" ? "失败" : status === "cancelled" ? "已取消" : "未检查";

  return <StatusSummary ariaLabel={`${profile.label} 符合性状态`} items={[{ label: "符合性", value: <StatusBadge tone={status === "succeeded" ? "success" : status === "failed" ? "danger" : "neutral"}>{statusLabel}</StatusBadge> }, ...(check?.status === "running" ? [{ label: "阶段", value: phaseLabels[check.phase] }] : []), ...(check?.errorMessage ? [{ label: "失败原因", value: check.errorMessage }] : profile.unavailableReason ? [{ label: "不可用原因", value: profile.unavailableReason }] : [])]} />;
}

function residentContextLabel(context: AgentOllamaResidentContext) {
  if (context.status === "not-loaded") return "未加载，无法测量实际值";
  if (context.status === "loaded-unreported") return "已加载，但 Ollama 未报告实际值";
  return `${context.allocatedContextTokens} tokens`;
}

function profileDraftFrom(profile: AgentProfileView): ProfileDraft {
  return {
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
  };
}

function CodexProfileFields({ draft, setDraft }: { draft: ProfileDraft; setDraft(value: ProfileDraft): void }) {
  return <>
    <FieldRow fieldId="settings-profile-reasoning" label="推理强度">{(a) => <select {...a} aria-label="Profile 推理强度" className="ui-input" onChange={(e) => setDraft({ ...draft, reasoningEffort: e.currentTarget.value as ProfileDraft["reasoningEffort"] })} value={draft.reasoningEffort}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select>}</FieldRow>
    <FieldRow fieldId="settings-profile-input-characters" label="输入字符">{(a) => <input {...a} aria-label="Profile 输入字符" className="ui-input" min="1" onChange={(e) => setDraft({ ...draft, maxInputCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.maxInputCharacters} />}</FieldRow>
    <FieldRow fieldId="settings-profile-output-characters" label="输出字符">{(a) => <input {...a} aria-label="Profile 输出字符" className="ui-input" min="1" onChange={(e) => setDraft({ ...draft, maxOutputCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputCharacters} />}</FieldRow>
  </>;
}

function ChatProfileFields({ draft, providerKind, setDraft }: { draft: ProfileDraft; providerKind: AgentProviderKind; setDraft(value: ProfileDraft): void }) {
  return <>
    <FieldRow fieldId="settings-profile-tool-mode" label="工具模式">{(a) => <select {...a} aria-label="Profile 工具模式" className="ui-input" onChange={(e) => setDraft({ ...draft, toolCallMode: e.currentTarget.value as AgentToolCallMode })} value={draft.toolCallMode}><option value="native">native</option>{providerKind === "ollama" ? <option value="single-json">single-json</option> : null}</select>}</FieldRow>
    {providerKind === "ollama" ? <FieldRow fieldId="settings-profile-chat-reasoning" label="推理强度">{(a) => <select {...a} aria-label="Profile Chat 推理强度" className="ui-input" onChange={(e) => setDraft({ ...draft, chatReasoningEffort: e.currentTarget.value as AgentChatReasoningEffort })} value={draft.chatReasoningEffort}><option value="model-default">模型默认</option><option value="none">关闭</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>}</FieldRow> : null}
    <FieldRow description="仅控制 Cognition Tree 何时压缩内存对话；不会修改 Ollama num_ctx，也不代表模型的真实 token 上限。" fieldId="settings-profile-history-budget" label="会话历史预算（字符）">{(a) => <input {...a} aria-label="Profile 会话历史预算（字符）" className="ui-input" min="1" onChange={(e) => setDraft({ ...draft, historyBudgetCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.historyBudgetCharacters} />}</FieldRow>
    <FieldRow fieldId="settings-profile-output-tokens" label="输出 tokens">{(a) => <input {...a} aria-label="Profile 输出 Tokens" className="ui-input" min="1" onChange={(e) => setDraft({ ...draft, maxOutputTokens: e.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputTokens} />}</FieldRow>
    <FieldRow fieldId="settings-profile-tool-steps" label="工具步数">{(a) => <input {...a} aria-label="Profile 工具步数" className="ui-input" min="3" onChange={(e) => setDraft({ ...draft, maxToolSteps: e.currentTarget.valueAsNumber })} type="number" value={draft.maxToolSteps} />}</FieldRow>
  </>;
}
