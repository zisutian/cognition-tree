import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SettingsContext,
  SettingsPanel,
} from "../../../../presentation/activities/settings/SettingsPanel";
import { SettingsStatusPanel } from "../../../../presentation/activities/settings/SettingsStatusPanel";
import {
  appContextDefaultWidth,
} from "../../../../presentation/ui/workbench/frameResize";
import { expectMarkupSemantics } from "../../markupSemantics";
import { createAgentApplicationFixture } from "../../fixtures/agentApplicationFixture";
import {
  createApiAccessSettingsSessionFixture,
} from "../../fixtures/apiAccessSettingsSessionFixture";
import {
  createSystemOwnerCredentialSessionFixture,
} from "../../fixtures/systemOwnerCredentialSessionFixture";
import {
  createOperationsSettingsSessionFixture,
} from "../../fixtures/operationsSettingsSessionFixture";
import type { SystemApplication } from "../../../../application/system";

const apiAccess = {
  administration: {
    createToken: async () => {
      throw new Error("not called during server rendering");
    },
    createTrustedClientToken: async () => {
      throw new Error("not called during server rendering");
    },
    listTrustedClientTokens: async () => [],
    listTokens: async () => [],
    revokeTrustedClientToken: async () => undefined,
    revokeToken: async () => undefined,
  },
  repositories: [{ id: "primary", label: "主仓库" }],
};
const apiAccessSession = createApiAccessSettingsSessionFixture({
  repositories: apiAccess.repositories,
});
const operationsSession = createOperationsSettingsSessionFixture({
  snapshot: {
    entries: [],
    errorMessage: null,
    loading: false,
    selectedEntryId: null,
    status: { status: "available" },
  },
});
const systemOwnerCredentialSession = createSystemOwnerCredentialSessionFixture({
  snapshot: {
    activationStatus: "awaiting-confirmation",
    preparation: {
      baseRevision: `sha256:${"4".repeat(64)}`,
      rotationId: "rotation-1",
      secret: "ctn_owner_once",
    },
  },
});
const baseAgent = createAgentApplicationFixture();
const systemConfiguration = {
  configuration: {
    dataRoot: "/srv/cognition-tree",
    listenMode: "loopback" as const,
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  effectiveConfiguration: {
    dataRoot: "/srv/cognition-tree",
    listenMode: "loopback" as const,
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  ownerCredentialConfigured: false,
  ownerCredentialRotationPending: true,
  restartRequired: false,
  revision: `sha256:${"4".repeat(64)}` as const,
  runtimeApplyErrorMessage: null,
  version: 1,
};
const authenticationState = {
  authenticated: true,
  errorMessage: null,
  status: "ready" as const,
};
const configurationState = {
  configuration: systemConfiguration,
  errorMessage: null,
  loadStatus: "ready" as const,
  migration: null,
  operationStatus: "idle" as const,
};
const system = {
  authenticationController: {
    getSnapshot: () => authenticationState,
    load: async () => undefined,
    login: async () => undefined,
    logout: async () => undefined,
    subscribe: () => () => undefined,
  },
  authenticationState,
  configurationController: {
    activateOwnerCredentialRotation: async () => undefined,
    clearOwnerCredential: async () => undefined,
    dispose: () => undefined,
    getSnapshot: () => configurationState,
    load: async () => undefined,
    migrateDataRoot: async () => undefined,
    prepareOwnerCredentialRotation: async () => ({
      configuration: systemConfiguration,
      rotationId: "rotation-1",
      secret: "secret",
    }),
    subscribe: () => () => undefined,
    update: async () => systemConfiguration,
  },
  configurationState,
} satisfies SystemApplication;
const agent = {
  ...baseAgent,
  configurationState: {
    ...baseAgent.configurationState,
    configuration: {
      profiles: [{
        availability: "available" as const,
        conformance: null,
        digest: `sha256:${"1".repeat(64)}` as const,
        id: "codex-safe",
        label: "Codex Safe",
        maxResidentSessions: 1,
        model: "gpt-5.6-codex",
        parameters: {
          kind: "codex" as const,
          maxInputCharacters: 100_000,
          maxOutputCharacters: 50_000,
          reasoningEffort: "high" as const,
        },
        providerId: "codex-provider",
        timeoutMilliseconds: 120_000,
        unavailableReason: null,
        version: 1,
      }, {
        availability: "unavailable" as const,
        conformance: null,
        digest: `sha256:${"5".repeat(64)}` as const,
        id: "ollama-local",
        label: "Ollama Local",
        maxResidentSessions: 1,
        model: "qwen3.8:27b",
        parameters: {
          historyBudgetCharacters: 65_536,
          kind: "chat" as const,
          maxOutputTokens: 2_048,
          maxToolSteps: 8,
          reasoningEffort: "model-default" as const,
          toolCallMode: "single-json" as const,
        },
        providerId: "ollama-provider",
        timeoutMilliseconds: 900_000,
        unavailableReason: "Tool-call conformance has not been verified",
        version: 3,
      }],
      providers: [{
        authenticationStatus: "configured" as const,
        authenticationType: "api-key" as const,
        baseUrl: null,
        digest: `sha256:${"2".repeat(64)}` as const,
        id: "codex-provider",
        kind: "codex" as const,
        label: "Codex",
        privateNetworkAccess: "not-required" as const,
        version: 1,
      }, {
        authenticationStatus: "missing" as const,
        authenticationType: "chatgpt-device-code" as const,
        baseUrl: null,
        digest: `sha256:${"7".repeat(64)}` as const,
        id: "codex-device-provider",
        kind: "codex" as const,
        label: "ChatGPT Codex",
        privateNetworkAccess: "not-required" as const,
        version: 1,
      }, {
        authenticationStatus: "not-required" as const,
        authenticationType: "none" as const,
        baseUrl: "http://127.0.0.1:11434",
        digest: `sha256:${"6".repeat(64)}` as const,
        id: "ollama-provider",
        kind: "ollama" as const,
        label: "Local Ollama",
        privateNetworkAccess: "not-required" as const,
        version: 1,
      }],
      revision: `sha256:${"3".repeat(64)}` as const,
    },
    probes: {
      "ollama-provider": {
        modelContexts: [{
          declaredMaximumContextTokens: 262_144,
          model: "qwen3.8:27b",
          residentContext: {
            allocatedContextTokens: 24_576,
            status: "loaded" as const,
          },
        }, {
          declaredMaximumContextTokens: 262_144,
          model: "qwen3.5:9b",
          residentContext: { status: "not-loaded" as const },
        }, {
          declaredMaximumContextTokens: null,
          model: "unreported-model",
          residentContext: { status: "loaded-unreported" as const },
        }],
        models: ["qwen3.8:27b"],
        probedAt: "2026-08-25T00:00:00.000Z",
        reachable: true,
      },
    },
  },
  state: {
    ...baseAgent.state,
    preferredProfileId: null,
    status: {
      configurationProblem: null,
      enabled: true,
      profiles: [{
        authenticationStatus: "configured" as const,
        availability: "available" as const,
        id: "codex-safe",
        kind: "codex" as const,
        label: "Codex Safe",
        model: "gpt-5.6-codex",
        unavailableReason: null,
      }],
    },
  },
};
const overviewAgentRoute = { page: "overview" } as const;
const onAgentRouteChange = () => undefined;

describe("settings activity", () => {
  it("blocks provider mutations while a device login is pending", () => {
    const pendingAgent = {
      ...agent,
      configurationState: {
        ...agent.configurationState,
        codexDeviceLogins: {
          "codex-device-provider": {
            completedAt: null,
            errorMessage: null,
            expiresAt: "2026-08-25T00:15:00.000Z",
            id: "login-1",
            providerId: "codex-device-provider",
            startedAt: "2026-08-25T00:00:00.000Z",
            status: "pending" as const,
            userCode: "ABCD-EFGH",
            verificationUrl: "https://auth.openai.com/device",
          },
        },
        configuration: {
          ...agent.configurationState.configuration!,
          providers: agent.configurationState.configuration!.providers.map(
            (provider) => provider.id === "codex-device-provider"
              ? { ...provider, authenticationStatus: "configured" as const }
              : provider,
          ),
        },
      },
    };
    const markup = renderToStaticMarkup(
      <SettingsPanel
        agent={pendingAgent}
        agentRoute={{
          page: "providers",
          selectedProviderId: "codex-device-provider",
        }}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="agent"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        /aria-label="退出 ChatGPT Codex 认证"[^>]*disabled=""/,
        /aria-label="编辑 ChatGPT Codex"[^>]*disabled=""/,
        /aria-label="删除 ChatGPT Codex"[^>]*disabled=""/,
        /<button(?![^>]*disabled="")[^>]*aria-label="取消 ChatGPT Codex 登录"/,
      ],
    });
  });

  it("separates interface preferences from scoped server API access", () => {
    const statusProps = {
      agent,
      agentRoute: overviewAgentRoute,
      apiAccessSession,
      apiAccessSelection: { kind: "overview" } as const,
      onCollapseDetail: () => undefined,
      operationsSession,
      systemConfigurationState: configurationState,
      systemOwnerCredentialSession,
    };
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    const apiMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="api-access"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="agent"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentProviderMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={{
          page: "providers",
          selectedProviderId: "ollama-provider",
        }}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="agent"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentProfileMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={{
          page: "profiles",
          selectedProfileId: "ollama-local",
        }}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="agent"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const serviceMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="system"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentProviderStatusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        {...statusProps}
        agentRoute={{
          page: "providers",
          selectedProviderId: "ollama-provider",
        }}
        section="agent"
      />,
    );
    const agentProfileStatusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        {...statusProps}
        agentRoute={{
          page: "profiles",
          selectedProfileId: "ollama-local",
        }}
        section="agent"
      />,
    );
    const serviceStatusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        {...statusProps}
        section="system"
      />,
    );
    const runtimeApplyFailureStatusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        {...statusProps}
        section="system"
        systemConfigurationState={{
          ...configurationState,
          configuration: {
            ...systemConfiguration,
            configuration: {
              ...systemConfiguration.configuration,
              maxAuditEntries: 25,
            },
            restartRequired: true,
            runtimeApplyErrorMessage: "audit capacity update failed",
          },
        }}
      />,
    );
    const auditMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="audit"
        system={system}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(5);
    expectMarkupSemantics(contextMarkup, {
      has: ['aria-current="page"', "界面", "服务", "智能体", "API 访问", "审计", "<button"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: [
        'aria-label="设置"', 'data-tool-layout="form"', "界面",
        'id="settings-context-width"',
        `value="${appContextDefaultWidth}"`, "左侧栏宽度",
      ],
      lacks: ["当前仓库", "添加仓库", "危险区"],
    });
    expect(panelMarkup.match(/<input/g)).toHaveLength(1);
    expectMarkupSemantics(apiMarkup, {
      has: [
        "创建令牌",
        "Automation",
        "Workspace 权限",
        "日记权限",
        "代办权限",
        "仓库范围",
        "现有令牌",
      ],
      lacks: [
        "/api/v4/content/*",
        "sync、agent 或 admin",
        "令牌仅显示这一次",
        "为自动化工具创建独立令牌",
        'type="checkbox"',
        'type="radio"',
      ],
    });
    expect(apiMarkup.match(/<select/g) ?? []).toHaveLength(0);
    expectMarkupSemantics(apiMarkup, { lacks: ["Agent 写入审计", "操作审计"] });
    expectMarkupSemantics(auditMarkup, {
      has: [
        'aria-label="审计"',
        "操作记录",
      ],
      lacks: ["浏览器自动保存不会形成审计记录"],
    });
    expectMarkupSemantics(agentMarkup, {
      has: [
        'aria-label="智能体设置"',
        'role="tablist"',
        'role="tabpanel"',
        "概览",
        "Provider",
        "Profile",
        "默认 Profile",
        "Codex Safe",
        "发现本地 Ollama",
        "刷新状态",
      ],
      lacks: ["Provider 名称", "Profile Provider", "provider-secret"],
    });
    expectMarkupSemantics(agentProviderMarkup + agentProviderStatusMarkup, {
      has: [
        'aria-label="Provider 列表"',
        "ollama",
        "认证已配置",
        "使用 ChatGPT 登录",
        "上限 262144 · 驻留 24576 tokens",
        "上限 262144 · 驻留 未加载",
        "上限 未知 · 驻留 未报告",
        "新建 Provider",
      ],
      lacks: ["Provider 名称", "Provider API Key"],
    });
    expectMarkupSemantics(agentProfileMarkup + agentProfileStatusMarkup, {
      has: [
        'aria-label="Profile 列表"',
        "Codex Safe",
        "qwen3.8:27b",
        "符合性检查",
        "Tool-call conformance has not been verified",
        "新建 Profile",
      ],
      lacks: ["Profile Provider", "Profile API Key"],
    });
    expectMarkupSemantics(serviceMarkup + serviceStatusMarkup, {
      has: [
        'aria-label="服务设置"',
        "当前数据根",
        "当前审计上限",
        "/srv/cognition-tree",
        "已生效",
        'aria-label="服务状态"',
        "所有者凭据",
        "迁移数据根",
        "操作审计保留条数",
        "ctn_owner_once",
        "我已保存，激活新密钥",
        "待激活新密钥",
        "关闭显示",
      ],
      lacks: ["CTN_", "owner token", "重新准备新密钥"],
    });
    expectMarkupSemantics(runtimeApplyFailureStatusMarkup, {
      has: [
        "部分生效",
        "当前审计上限",
        "应用错误",
        "audit capacity update failed",
      ],
      lacks: ["已生效"],
    });
    for (const markup of [
      panelMarkup,
      apiMarkup,
      agentMarkup,
      agentProviderMarkup,
      agentProfileMarkup,
      serviceMarkup,
      auditMarkup,
    ]) {
      expect(markup).toContain("ui-tool-panel");
      expect(markup).toContain('data-tool-layout="form"');
    }
  });

  it("offers a fresh prepare when only the persisted pending marker remains", () => {
    const reloadedSession = createSystemOwnerCredentialSessionFixture();
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="system"
        system={system}
        systemOwnerCredentialSession={reloadedSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const statusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSelection={{ kind: "overview" }}
        apiAccessSession={apiAccessSession}
        onCollapseDetail={() => undefined}
        operationsSession={operationsSession}
        section="system"
        systemConfigurationState={configurationState}
        systemOwnerCredentialSession={reloadedSession}
      />,
    );

    expectMarkupSemantics(panelMarkup + statusMarkup, {
      has: [
        "重新准备新密钥",
        "没有对应明文密钥",
        "待处理轮换",
        "有",
      ],
      lacks: ["我已保存，激活新密钥", "待激活新密钥", "ctn_owner_once"],
    });
  });

  it("keeps recovery guidance beside the secret when activation fails", () => {
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSession={apiAccessSession}
        onAgentRouteChange={onAgentRouteChange}
        operationsSession={operationsSession}
        section="system"
        system={{
          ...system,
          configurationState: {
            ...configurationState,
            errorMessage: "durable write outcome could not be verified",
          },
        }}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const statusMarkup = renderToStaticMarkup(
      <SettingsStatusPanel
        agent={agent}
        agentRoute={overviewAgentRoute}
        apiAccessSelection={{ kind: "overview" }}
        apiAccessSession={apiAccessSession}
        onCollapseDetail={() => undefined}
        operationsSession={operationsSession}
        section="system"
        systemConfigurationState={{
          ...configurationState,
          errorMessage: "durable write outcome could not be verified",
        }}
        systemOwnerCredentialSession={systemOwnerCredentialSession}
      />,
    );

    expectMarkupSemantics(panelMarkup + statusMarkup, {
      has: [
        "ctn_owner_once",
        "激活结果可能未知",
        "重新读取状态",
        "用该密钥重新登录",
      ],
    });
  });
});
