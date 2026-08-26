import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SettingsContext,
  SettingsPanel,
} from "../../../../presentation/activities/settings/SettingsPanel";
import {
  appContextDefaultWidth,
} from "../../../../presentation/ui/workbench/frameResize";
import { expectMarkupSemantics } from "../../markupSemantics";
import { createAgentApplicationFixture } from "../../fixtures/agentApplicationFixture";
import type { SystemApplication } from "../../../../application/system";

const apiAccess = {
  administration: {
    createToken: async () => {
      throw new Error("not called during server rendering");
    },
    listAgentOperations: async () => ({ cursor: null, entries: [] }),
    listTokens: async () => [],
    revokeToken: async () => undefined,
  },
  repositories: [{ id: "primary", label: "主仓库" }],
};
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
  restartRequired: false,
  revision: `sha256:${"4".repeat(64)}` as const,
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
  revealedOwnerSecret: null,
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
    clearOwnerCredential: async () => undefined,
    dismissRevealedOwnerSecret: () => undefined,
    getSnapshot: () => configurationState,
    load: async () => undefined,
    migrateDataRoot: async () => undefined,
    rotateOwnerCredential: async () => undefined,
    subscribe: () => () => undefined,
    update: async () => undefined,
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
        baseUrl: null,
        digest: `sha256:${"2".repeat(64)}` as const,
        id: "codex-provider",
        kind: "codex" as const,
        label: "Codex",
        privateNetworkAccess: "not-required" as const,
        version: 1,
      }, {
        authenticationStatus: "not-required" as const,
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
          loadedContextTokens: 24_576,
          model: "qwen3.8:27b",
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

describe("settings activity", () => {
  it("separates interface preferences from scoped server API access", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        system={system}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    const apiMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        section="api-access"
        system={system}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        section="agent"
        system={system}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const serviceMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        section="system"
        system={system}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(4);
    expectMarkupSemantics(contextMarkup, {
      has: ['aria-current="page"', "界面", "服务", "智能体", "API 访问", "<button"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: [
        'aria-label="设置"', "界面", 'id="settings-context-width"',
        `value="${appContextDefaultWidth}"`, "左侧栏宽度",
      ],
      lacks: ["当前仓库", "添加仓库", "危险区"],
    });
    expect(panelMarkup.match(/<input/g)).toHaveLength(1);
    expectMarkupSemantics(apiMarkup, {
      has: [
        "创建令牌",
        "领域权限",
        "Workspace 权限",
        "日记权限",
        "代办权限",
        "仓库范围",
        "现有令牌",
        "Agent 写入审计",
        "/api/v3/content/*",
        "sync、agent 或 admin",
      ],
      lacks: [
        "令牌仅显示这一次",
        "为自动化工具创建独立令牌",
        'type="checkbox"',
        'type="radio"',
      ],
    });
    expect(apiMarkup.match(/<select/g)).toHaveLength(4);
    expectMarkupSemantics(agentMarkup, {
      has: [
        'aria-label="智能体设置"',
        "默认 Profile",
        "Codex Safe",
        "gpt-5.6-codex",
        "codex",
        "认证已配置",
        "发现本地 Ollama",
        "模型声明上限：262144 tokens",
        "当前加载：24576 tokens",
        "凭据保存后",
        "创建 Profile",
        "刷新状态",
      ],
      lacks: ["provider-secret"],
    });
    expectMarkupSemantics(serviceMarkup, {
      has: [
        'aria-label="服务设置"',
        "当前数据根",
        "/srv/cognition-tree",
        "当前配置已经生效",
        "所有者凭据",
        "迁移数据根",
        "智能体审计保留条数",
      ],
      lacks: ["CTN_", "owner token"],
    });
  });
});
