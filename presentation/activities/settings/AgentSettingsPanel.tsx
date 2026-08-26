// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState, type FormEvent } from "react";
import type {
  AgentApplication,
  AgentChatReasoningEffort,
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
  ToggleButton,
} from "../../ui/shared/primitives";
import { ChoiceGroup, InputControl, SelectControl } from "../../ui/shared/controls";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import { SubsectionTabs } from "../../ui/shared/SubsectionTabs";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type { AgentSettingsSelection } from "./settingsTypes";

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
  onSelectionChange,
  page,
  selection,
}: {
  agent: AgentApplication;
  onPageChange(page: AgentSettingsPage): void;
  onSelectionChange(selection: AgentSettingsSelection): void;
  page: AgentSettingsPage;
  selection: AgentSettingsSelection;
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
    onSelectionChange(nextPage === "providers" && providers[0]
      ? { id: providers[0].id, kind: "provider" }
      : nextPage === "profiles" && profiles[0]
        ? { id: profiles[0].id, kind: "profile" }
        : { kind: "overview" });
    onPageChange(nextPage);
  };
  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    const input = providerInput(providerDraft);

    void feedback.runAction(async () => {
      if (editingProviderId) {
        await configurationController.updateProvider(editingProviderId, input);
        onSelectionChange({ id: editingProviderId, kind: "provider" });
      } else {
        const previousIds = new Set(providers.map(({ id }) => id));
        await configurationController.createProvider(input);
        const created = configurationController.getSnapshot().configuration
          ?.providers.find(({ id }) => !previousIds.has(id));

        if (created) onSelectionChange({ id: created.id, kind: "provider" });
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
        onSelectionChange({ id: editingProfileId, kind: "profile" });
      } else {
        const previousIds = new Set(profiles.map(({ id }) => id));
        await configurationController.createProfile(input);
        const created = configurationController.getSnapshot().configuration
          ?.profiles.find(({ id }) => !previousIds.has(id));

        if (created) onSelectionChange({ id: created.id, kind: "profile" });
      }
      resetProfileForm();
    });
  };
  const refresh = () => void feedback.runAction(async () => {
    await configurationController.load();
    await controller.refreshStatus();
  });

  return (
    <ToolPanel
      actions={(
        <Button
          disabled={busy || state.operationStatus === "working"}
          onClick={refresh}
          type="button"
        >
          刷新状态
        </Button>
      )}
      aria-label="智能体设置"
      className="settings-panel"
      title="智能体"
    >
      <ToolPanelBody layout="form">
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
              onSelectionChange={onSelectionChange}
              onSubmit={submitProvider}
              providers={providers}
              selection={selection}
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
              onSelectionChange={onSelectionChange}
              onSubmit={submitProfile}
              profiles={profiles}
              providers={providers}
              selectedProvider={selectedProvider}
              selection={selection}
            />
          )}
        </SubsectionTabs>
      </ToolPanelBody>
    </ToolPanel>
  );
}

function AgentOverview({
  agent,
  busy,
  ollamaEndpoint,
  onEndpointChange,
  onPageChange,
  statusProfiles,
}: {
  agent: AgentApplication;
  busy: boolean;
  ollamaEndpoint: string;
  onEndpointChange(value: string): void;
  onPageChange(page: AgentSettingsPage): void;
  statusProfiles: NonNullable<AgentApplication["state"]["status"]>["profiles"];
}) {
  const feedback = useFeedback();
  return (
    <ToolSectionStack>
      <ToolSection title="默认 Profile">
        <FormLayout>
          <FieldRow fieldId="settings-agent-default-profile" label="默认 Profile">
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="默认 Profile"
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
              </SelectControl>
            )}
          </FieldRow>
        </FormLayout>
      </ToolSection>
      <ToolSection title="发现本地 Ollama">
        <FormLayout>
          <FieldRow fieldId="settings-agent-ollama-endpoint" label="Ollama 地址">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="Ollama 地址"
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
      </ToolSection>
      <ToolSection aria-label="智能体管理入口">
        <div className="settings-agent-overview-links">
          <Button onClick={() => onPageChange("providers")} type="button">
            管理 Provider
          </Button>
          <Button onClick={() => onPageChange("profiles")} type="button">
            管理 Profile
          </Button>
        </div>
      </ToolSection>
    </ToolSectionStack>
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
  onSelectionChange,
  onSubmit,
  providers,
  selection,
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
  onSelectionChange(selection: AgentSettingsSelection): void;
  onSubmit(event: FormEvent): void;
  providers: readonly AgentProviderView[];
  selection: AgentSettingsSelection;
}) {
  const feedback = useFeedback();

  if (formVisible) {
    return (
      <ToolSection
        title={editingProviderId ? "编辑 Provider" : "新建 Provider"}
      >
        <ProviderForm
          busy={busy}
          draft={draft}
          editing={editingProviderId !== null}
          onCancel={onCancel}
          onChange={onDraftChange}
          onSubmit={onSubmit}
        />
      </ToolSection>
    );
  }

  return (
    <ToolSection
      actions={(
        <Button onClick={onBeginCreate} type="button" variant="primary">
          新建 Provider
        </Button>
      )}
      title="Provider"
    >
      {providers.length === 0 ? (
        <EmptyState compact title="尚未创建 Provider" />
      ) : (
        <ManagementList aria-label="Provider 列表">
          {providers.map((provider, index) => {
            const login = agent.configurationState.codexDeviceLogins[provider.id];

            return (
              <ManagementRow
                actions={(
                  <>
                    <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.probeProvider(provider.id))} type="button">探测</Button>
                    {provider.kind === "codex" && provider.authenticationType === "chatgpt-device-code" && login?.status !== "pending" ? (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.startCodexDeviceLogin(provider.id))} type="button">使用 ChatGPT 登录</Button>
                    ) : null}
                    {login?.status === "pending" ? (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.cancelCodexDeviceLogin(provider.id))} type="button">取消登录</Button>
                    ) : null}
                    {provider.authenticationStatus === "configured" ? (
                      <Button disabled={busy} onClick={() => void feedback.runAction(() => agent.configurationController.clearProviderAuthentication(provider.id))} type="button">退出认证</Button>
                    ) : null}
                    <Button disabled={busy} onClick={() => onEdit(provider)} type="button">编辑</Button>
                    <Button disabled={busy} onClick={() => void feedback.runAction(async () => {
                      await agent.configurationController.deleteProvider(provider.id);
                      const remaining = agent.configurationController.getSnapshot().configuration?.providers ?? [];
                      const next = remaining[Math.min(index, Math.max(0, remaining.length - 1))];

                      onSelectionChange(next
                        ? { id: next.id, kind: "provider" }
                        : { kind: "overview" });
                    })} type="button" variant="danger">删除</Button>
                  </>
                )}
                key={provider.id}
                onSelect={() => onSelectionChange({ id: provider.id, kind: "provider" })}
                selected={selection.kind === "provider" && selection.id === provider.id}
                status={<StatusBadge tone={provider.authenticationStatus === "missing" ? "warning" : "success"}>{authenticationLabels[provider.authenticationStatus]}</StatusBadge>}
                title={`${provider.label} · v${provider.version}`}
              />
            );
          })}
        </ManagementList>
      )}
    </ToolSection>
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
  onSelectionChange,
  onSubmit,
  profiles,
  providers,
  selectedProvider,
  selection,
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
  onSelectionChange(selection: AgentSettingsSelection): void;
  onSubmit(event: FormEvent): void;
  profiles: readonly AgentProfileView[];
  providers: readonly AgentProviderView[];
  selectedProvider: AgentProviderView | null;
  selection: AgentSettingsSelection;
}) {
  const feedback = useFeedback();
  if (formVisible) {
    return (
      <ToolSection title={editingProfileId ? "编辑 Profile" : "新建 Profile"}>
        <ProfileForm
          busy={busy}
          draft={draft}
          editing={editingProfileId !== null}
          modelOptions={modelOptions}
          onCancel={onCancel}
          onChange={onDraftChange}
          onSubmit={onSubmit}
          providers={providers}
          selectedProvider={selectedProvider}
        />
      </ToolSection>
    );
  }

  return (
    <ToolSection
      actions={(
        <Button onClick={onBeginCreate} type="button" variant="primary">
          新建 Profile
        </Button>
      )}
      title="Profile"
    >
      {profiles.length === 0 ? (
        <EmptyState compact title="尚未创建 Profile" />
      ) : (
        <ManagementList aria-label="Profile 列表">
          {profiles.map((profile, index) => {
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
                    <Button disabled={busy} onClick={() => void feedback.runAction(async () => {
                      await agent.configurationController.deleteProfile(profile.id);
                      const remaining = agent.configurationController.getSnapshot().configuration?.profiles ?? [];
                      const next = remaining[Math.min(index, Math.max(0, remaining.length - 1))];

                      onSelectionChange(next
                        ? { id: next.id, kind: "profile" }
                        : { kind: "overview" });
                    })} type="button" variant="danger">删除</Button>
                  </>
                )}
                key={profile.id}
                onSelect={() => onSelectionChange({ id: profile.id, kind: "profile" })}
                selected={selection.kind === "profile" && selection.id === profile.id}
                status={<StatusBadge tone={profile.availability === "available" ? "success" : "warning"}>{profile.availability === "available" ? "可用" : "不可用"}</StatusBadge>}
                title={profile.label}
              />
            );
          })}
        </ManagementList>
      )}
    </ToolSection>
  );
}

function ProviderForm({ busy, draft, editing, onCancel, onChange, onSubmit }: { busy: boolean; draft: ProviderDraft; editing: boolean; onCancel(): void; onChange(draft: ProviderDraft): void; onSubmit(event: FormEvent): void }) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-provider-name" label="名称">
          {(a) => <InputControl {...a} aria-label="Provider 名称" onChange={(e) => onChange({ ...draft, label: e.currentTarget.value })} required value={draft.label} />}
        </FieldRow>
        <FieldRow fieldId="settings-provider-kind" label="类型">
          {(a) => <ChoiceGroup {...a} ariaLabel="Provider 类型" mode="single" onChange={(kind) => onChange({ ...draft, authenticationType: kind === "ollama" ? "none" : "api-key", baseUrl: kind === "ollama" ? "http://127.0.0.1:11434" : kind === "codex" ? "" : draft.baseUrl, kind, privateNetworkAccessConfirmed: false })} options={[{ label: "Ollama", value: "ollama" }, { label: "OpenAI-compatible", value: "openai-chat" }, { label: "Codex", value: "codex" }]} value={draft.kind} />}
        </FieldRow>
        {draft.kind !== "codex" ? (
          <FieldRow fieldId="settings-provider-address" label="地址">
            {(a) => <InputControl {...a} aria-label="Provider 地址" onChange={(e) => onChange({ ...draft, baseUrl: e.currentTarget.value, privateNetworkAccessConfirmed: false })} required value={draft.baseUrl} />}
          </FieldRow>
        ) : null}
        <FieldRow fieldId="settings-provider-authentication" label="认证">
          {(a) => <ChoiceGroup {...a} ariaLabel="Provider 认证" mode="single" onChange={(authenticationType) => onChange({ ...draft, authenticationType })} options={draft.kind === "codex" ? [{ label: "API Key", value: "api-key" }, { label: "ChatGPT 设备码", value: "chatgpt-device-code" }] : [{ label: "无需认证", value: "none" }, { label: "API Key", value: "api-key" }]} value={draft.authenticationType} />}
        </FieldRow>
        {draft.authenticationType === "api-key" ? (
          <FieldRow fieldId="settings-provider-api-key" label="API Key">
            {(a) => <InputControl {...a} aria-label="Provider API Key" autoComplete="new-password" onChange={(e) => onChange({ ...draft, apiKey: e.currentTarget.value })} required={!editing} type="password" value={draft.apiKey} />}
          </FieldRow>
        ) : null}
        {draft.kind !== "codex" ? (
          <FieldRow fieldId="settings-provider-private-network" label="私网许可">
            {(a) => (
              <ToggleButton
                {...a}
                aria-label="确认 Provider 私网访问"
                onClick={() => onChange({ ...draft, privateNetworkAccessConfirmed: !draft.privateNetworkAccessConfirmed })}
                pressed={draft.privateNetworkAccessConfirmed}
              >
                {draft.privateNetworkAccessConfirmed ? "已允许" : "未允许"}
              </ToggleButton>
            )}
          </FieldRow>
        ) : null}
        <FormActions><Button disabled={busy} type="submit" variant="primary">{editing ? "保存 Provider" : "创建 Provider"}</Button><Button onClick={onCancel} type="button">取消</Button></FormActions>
      </FormLayout>
    </form>
  );
}

function ProfileForm({ busy, draft, editing, modelOptions, onCancel, onChange, onSubmit, providers, selectedProvider }: { busy: boolean; draft: ProfileDraft; editing: boolean; modelOptions: readonly string[]; onCancel(): void; onChange(draft: ProfileDraft): void; onSubmit(event: FormEvent): void; providers: readonly AgentProviderView[]; selectedProvider: AgentProviderView | null }) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-profile-provider" label="Provider">{(a) => <SelectControl {...a} aria-label="Profile Provider" onChange={(e) => onChange({ ...draft, providerId: e.currentTarget.value })} required value={draft.providerId}><option value="">请选择</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</SelectControl>}</FieldRow>
        <FieldRow fieldId="settings-profile-name" label="名称">{(a) => <InputControl {...a} aria-label="Profile 名称" onChange={(e) => onChange({ ...draft, label: e.currentTarget.value })} required value={draft.label} />}</FieldRow>
        <FieldRow fieldId="settings-profile-model" label="模型">{(a) => <><InputControl {...a} aria-label="Profile 模型" list="agent-model-options" onChange={(e) => onChange({ ...draft, model: e.currentTarget.value })} required value={draft.model} /><datalist id="agent-model-options">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist></>}</FieldRow>
        <FieldRow fieldId="settings-profile-session-limit" label="会话上限">{(a) => <InputControl {...a} aria-label="Profile 会话上限" min="1" onChange={(e) => onChange({ ...draft, maxResidentSessions: e.currentTarget.valueAsNumber })} required type="number" value={draft.maxResidentSessions} />}</FieldRow>
        <FieldRow fieldId="settings-profile-timeout" label="超时毫秒">{(a) => <InputControl {...a} aria-label="Profile 超时" min="1" onChange={(e) => onChange({ ...draft, timeoutMilliseconds: e.currentTarget.valueAsNumber })} required type="number" value={draft.timeoutMilliseconds} />}</FieldRow>
        {selectedProvider?.kind === "codex" ? <CodexProfileFields draft={draft} setDraft={onChange} /> : selectedProvider ? <ChatProfileFields draft={draft} providerKind={selectedProvider.kind} setDraft={onChange} /> : null}
        <FormActions><Button disabled={busy || !selectedProvider} type="submit" variant="primary">{editing ? "保存 Profile" : "创建 Profile"}</Button><Button onClick={onCancel} type="button">取消</Button></FormActions>
      </FormLayout>
    </form>
  );
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
    <FieldRow fieldId="settings-profile-reasoning" label="推理强度">{(a) => <ChoiceGroup {...a} ariaLabel="Profile 推理强度" mode="single" onChange={(reasoningEffort) => setDraft({ ...draft, reasoningEffort })} options={[{ label: "low", value: "low" }, { label: "medium", value: "medium" }, { label: "high", value: "high" }, { label: "xhigh", value: "xhigh" }]} value={draft.reasoningEffort} />}</FieldRow>
    <FieldRow fieldId="settings-profile-input-characters" label="输入字符">{(a) => <InputControl {...a} aria-label="Profile 输入字符" min="1" onChange={(e) => setDraft({ ...draft, maxInputCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.maxInputCharacters} />}</FieldRow>
    <FieldRow fieldId="settings-profile-output-characters" label="输出字符">{(a) => <InputControl {...a} aria-label="Profile 输出字符" min="1" onChange={(e) => setDraft({ ...draft, maxOutputCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputCharacters} />}</FieldRow>
  </>;
}

function ChatProfileFields({ draft, providerKind, setDraft }: { draft: ProfileDraft; providerKind: AgentProviderKind; setDraft(value: ProfileDraft): void }) {
  return <>
    <FieldRow fieldId="settings-profile-tool-mode" label="工具模式">{(a) => <ChoiceGroup {...a} ariaLabel="Profile 工具模式" mode="single" onChange={(toolCallMode) => setDraft({ ...draft, toolCallMode })} options={providerKind === "ollama" ? [{ label: "native", value: "native" }, { label: "single-json", value: "single-json" }] : [{ label: "native", value: "native" }]} value={draft.toolCallMode} />}</FieldRow>
    {providerKind === "ollama" ? <FieldRow fieldId="settings-profile-chat-reasoning" label="推理强度">{(a) => <ChoiceGroup {...a} ariaLabel="Profile Chat 推理强度" mode="single" onChange={(chatReasoningEffort) => setDraft({ ...draft, chatReasoningEffort })} options={[{ label: "模型默认", value: "model-default" }, { label: "关闭", value: "none" }, { label: "low", value: "low" }, { label: "medium", value: "medium" }, { label: "high", value: "high" }]} value={draft.chatReasoningEffort} />}</FieldRow> : null}
    <FieldRow fieldId="settings-profile-history-budget" label="会话历史预算（字符）">{(a) => <InputControl {...a} aria-label="Profile 会话历史预算（字符）" min="1" onChange={(e) => setDraft({ ...draft, historyBudgetCharacters: e.currentTarget.valueAsNumber })} type="number" value={draft.historyBudgetCharacters} />}</FieldRow>
    <FieldRow fieldId="settings-profile-output-tokens" label="输出 tokens">{(a) => <InputControl {...a} aria-label="Profile 输出 Tokens" min="1" onChange={(e) => setDraft({ ...draft, maxOutputTokens: e.currentTarget.valueAsNumber })} type="number" value={draft.maxOutputTokens} />}</FieldRow>
    <FieldRow fieldId="settings-profile-tool-steps" label="工具步数">{(a) => <InputControl {...a} aria-label="Profile 工具步数" min="3" onChange={(e) => setDraft({ ...draft, maxToolSteps: e.currentTarget.valueAsNumber })} type="number" value={draft.maxToolSteps} />}</FieldRow>
  </>;
}
