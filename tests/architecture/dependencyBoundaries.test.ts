import { describe, expect, it } from "vitest";
import {
  listSourceDependencyCycles,
  listSourceImports,
  readSourceImports,
  sourceImportCorpus,
} from "./sourceGraph";
import { readModuleImports } from "./moduleImports";
import {
  auditApplicationCoordinationRoots,
  auditImportPolicies,
  createDependencyImportPolicies,
  createDependencyTextPolicies,
} from "./dependencyConstraintCatalog";
import { getSourceRoot } from "./sourceArchitecture";
import {
  applicationModules,
  sourceModules,
  sourceModulesByRoot,
} from "./sourceCorpus";
import {
  auditTextPolicies,
} from "../support/textPolicy";

const layeredTestModules = import.meta.glob([
  "../application/**/*.{ts,tsx}",
  "../contracts/**/*.{ts,tsx}",
  "../core/**/*.{ts,tsx}",
  "../infrastructure/**/*.{ts,tsx}",
  "../presentation/**/*.{ts,tsx}",
], {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const testLayerImports: Readonly<Record<string, readonly string[]>> = {
  application: ["application", "core"],
  contracts: ["contracts", "core"],
  core: ["core"],
  infrastructure: ["infrastructure", "application", "contracts", "core"],
  presentation: [
    "presentation",
    "infrastructure",
    "application",
    "contracts",
    "core",
  ],
};

const dependencyImportPolicies = createDependencyImportPolicies({
  getSourceRoot,
});
const dependencyTextPolicies = createDependencyTextPolicies({
  applicationModules,
  sourceImportCorpus,
});

function auditTestLayerImports() {
  return Object.entries(layeredTestModules).flatMap(([filePath, source]) => {
    const testLayer = filePath.split("/")[1] ?? "";
    const allowed = testLayerImports[testLayer] ?? [];

    return readModuleImports({ [filePath]: source }, filePath).flatMap(
      (importPath) => {
        const productionLayer = importPath.match(
          /(?:^|\/)(application|contracts|core|infrastructure|presentation)(?:\/|$)/,
        )?.[1];

        return productionLayer && !allowed.includes(productionLayer)
          ? [`${filePath} imports ${productionLayer} through ${importPath}`]
          : [];
      },
    );
  });
}

describe("dependency boundaries", () => {
  it("keeps the production source corpus complete and immutable", () => {
    const rootModulePaths = Object.values(sourceModulesByRoot)
      .flatMap((modules) => Object.keys(modules));

    expect(Object.keys(sourceModulesByRoot)).toEqual([
      "core",
      "contracts",
      "application",
      "infrastructure",
      "presentation",
    ]);
    expect(Object.isFrozen(sourceModulesByRoot)).toBe(true);
    expect(
      Object.values(sourceModulesByRoot).every((modules) =>
        Object.keys(modules).length > 0 && Object.isFrozen(modules)
      ),
    ).toBe(true);
    expect(new Set(rootModulePaths).size).toBe(rootModulePaths.length);
    expect(Object.keys(sourceModules)).toEqual(rootModulePaths);
    expect(Object.isFrozen(sourceModules)).toBe(true);
  });

  it("derives static, re-exported, and dynamic edges from the TypeScript AST", () => {
    const modules = {
      "sample.ts": `
        import value from "./imported";
        export { value as exported } from "./exported";
        export * from "./star";
        const lazy = import("./lazy");
      `,
    };

    expect(readModuleImports(modules, "sample.ts")).toEqual([
      "./imported",
      "./exported",
      "./star",
      "./lazy",
    ]);
    expect(
      readSourceImports(
        "../../presentation/shell/application/useWorkbenchApplicationBindings.ts",
      ).find(({ targetPath }) =>
        targetPath.endsWith("application/workbench/workbenchController.ts")
      ),
    ).toMatchObject({
      targetRoot: "application",
      targetPath: "../../application/workbench/workbenchController.ts",
    });
  });

  it("returns isolated copies of indexed source imports", () => {
    const filePath =
      "../../presentation/shell/application/useWorkbenchApplicationBindings.ts";
    const first = readSourceImports(filePath);
    const second = readSourceImports(filePath);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
  });

  it("enforces the shared dependency and runtime policy catalog", () => {
    const imports = listSourceImports();

    expect([
      ...auditApplicationCoordinationRoots(imports),
      ...auditImportPolicies(imports, dependencyImportPolicies),
      ...auditTextPolicies(dependencyTextPolicies),
      ...auditTestLayerImports(),
    ]).toEqual([]);
  });

  it("rejects repository, generic persistence, and peer-domain coupling", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../application/repository/view.ts",
        importPath: "../workspace/session",
        targetPath: "../../application/workspace/session.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../application/persistence/merge.ts",
        importPath: "../../core/todo/model",
        targetPath: "../../core/todo/model.ts",
        targetRoot: "core",
      },
      {
        filePath: "../../application/workspace/service.ts",
        importPath: "../journal/service",
        targetPath: "../../application/journal/service.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../infrastructure/client/http/apiTransport.ts",
        importPath: "../../../application/workspace/persistence/workspaceRepository",
        targetPath:
          "../../application/workspace/persistence/workspaceRepository.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../infrastructure/server/api/http/queryHandlers.ts",
        importPath: "../../../../core/todo/commands/todoCompletionRecurrenceCommands",
        targetPath:
          "../../core/todo/commands/todoCompletionRecurrenceCommands.ts",
        targetRoot: "core",
      },
      {
        filePath: "../../application/workbench/problems.ts",
        importPath: "../agent/controller",
        targetPath: "../../application/agent/controller.ts",
        targetRoot: "application",
      },
      {
        filePath:
          "../../infrastructure/server/agent/sessionTools.ts",
        importPath:
          "../../../application/workspace/commands/workspaceAgentCommandPreparation",
        targetPath:
          "../../application/workspace/commands/workspaceAgentCommandPreparation.ts",
        targetRoot: "application",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "peer domain isolation: ../../application/workspace/service.ts imports ../journal/service",
      "repository independence from domain content: ../../application/repository/view.ts imports ../workspace/session",
      "generic persistence and sync independence from domains: ../../application/persistence/merge.ts imports ../../core/todo/model",
      "generic client HTTP independence from domains: ../../infrastructure/client/http/apiTransport.ts imports ../../../application/workspace/persistence/workspaceRepository",
      "server API independence from core commands: ../../infrastructure/server/api/http/queryHandlers.ts imports ../../../../core/todo/commands/todoCompletionRecurrenceCommands",
      "Agent session tool coordinator independence from domains: ../../infrastructure/server/agent/sessionTools.ts imports ../../../application/workspace/commands/workspaceAgentCommandPreparation",
      "application coordination root independence: ../../application/workbench/problems.ts imports ../agent/controller",
    ]);
  });

  it("requires browser code to reach the server through the public API", () => {
    const violations = auditImportPolicies([{
      filePath: "../../presentation/shell/AppRoot.tsx",
      importPath: "../../infrastructure/server/agent/service",
      targetPath: "../../infrastructure/server/agent/service.ts",
      targetRoot: "infrastructure",
    }], dependencyImportPolicies);

    expect(violations).toEqual([
      "browser-to-server API boundary: ../../presentation/shell/AppRoot.tsx imports ../../infrastructure/server/agent/service",
    ]);
  });

  it("keeps Provider operation implementations behind their facade", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../infrastructure/server/agent/providerOperations.ts",
        importPath: "./conformanceOperations",
        targetPath:
          "../../infrastructure/server/agent/conformanceOperations.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/server/agent/providerOperations.ts",
        importPath: "./configuredAgentRuntimeFactory",
        targetPath:
          "../../infrastructure/server/agent/configuredAgentRuntimeFactory.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent Provider operation facade composition boundary: ../../infrastructure/server/agent/providerOperations.ts imports ./configuredAgentRuntimeFactory",
    ]);
  });

  it("keeps conversation turn orchestration behind Agent service", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/service.ts",
        importPath: "./conversationRunner",
        targetPath:
          "../../infrastructure/server/agent/conversationRunner.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/privateIpc.ts",
        importPath: "./conversationRunner",
        targetPath:
          "../../infrastructure/server/agent/conversationRunner.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent conversation composition boundary: ../../infrastructure/server/agent/privateIpc.ts imports ./conversationRunner",
    ]);
  });

  it("keeps session residency behind Agent service", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/service.ts",
        importPath: "./sessionPool",
        targetPath: "../../infrastructure/server/agent/sessionPool.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/conversationRunner.ts",
        importPath: "./sessionPool",
        targetPath: "../../infrastructure/server/agent/sessionPool.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent session pool composition boundary: ../../infrastructure/server/agent/conversationRunner.ts imports ./sessionPool",
    ]);
  });

  it("keeps Proposal owner decisions behind Agent service", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/service.ts",
        importPath: "./proposalWorkflow",
        targetPath: "../../infrastructure/server/agent/proposalWorkflow.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/sessionTools.ts",
        importPath: "./proposalWorkflow",
        targetPath: "../../infrastructure/server/agent/proposalWorkflow.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent Proposal workflow composition boundary: ../../infrastructure/server/agent/sessionTools.ts imports ./proposalWorkflow",
    ]);
  });

  it("keeps session bootstrap behind Agent service", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/service.ts",
        importPath: "./sessionOpener",
        targetPath: "../../infrastructure/server/agent/sessionOpener.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/privateIpc.ts",
        importPath: "./sessionOpener",
        targetPath: "../../infrastructure/server/agent/sessionOpener.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent session opener composition boundary: ../../infrastructure/server/agent/privateIpc.ts imports ./sessionOpener",
    ]);
  });

  it("keeps Profile configuration commands behind their store", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/configurationStore.ts",
        importPath: "./profileConfiguration",
        targetPath:
          "../../infrastructure/server/agent/profileConfiguration.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/sessionTools.ts",
        importPath: "./profileConfiguration",
        targetPath:
          "../../infrastructure/server/agent/profileConfiguration.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent Profile configuration composition boundary: ../../infrastructure/server/agent/sessionTools.ts imports ./profileConfiguration",
    ]);
  });

  it("keeps Provider configuration transactions behind their store", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../infrastructure/server/agent/configurationStore.ts",
        importPath: "./providerConfiguration",
        targetPath:
          "../../infrastructure/server/agent/providerConfiguration.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/sessionTools.ts",
        importPath: "./providerConfiguration",
        targetPath:
          "../../infrastructure/server/agent/providerConfiguration.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent Provider configuration composition boundary: ../../infrastructure/server/agent/sessionTools.ts imports ./providerConfiguration",
    ]);
  });

  it("keeps compatible chat protocol and session behind their owners", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../infrastructure/server/agent/openAiCompatibleSession.ts",
        importPath: "./openAiChatProtocol",
        targetPath:
          "../../infrastructure/server/agent/openAiChatProtocol.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/codexRuntime.ts",
        importPath: "./openAiChatProtocol",
        targetPath:
          "../../infrastructure/server/agent/openAiChatProtocol.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/ollamaRuntime.ts",
        importPath: "./openAiCompatibleSession",
        targetPath:
          "../../infrastructure/server/agent/openAiCompatibleSession.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/agent/service.ts",
        importPath: "./openAiCompatibleSession",
        targetPath:
          "../../infrastructure/server/agent/openAiCompatibleSession.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Agent compatible chat protocol boundary: ../../infrastructure/server/agent/codexRuntime.ts imports ./openAiChatProtocol",
      "Agent compatible chat session composition boundary: ../../infrastructure/server/agent/service.ts imports ./openAiCompatibleSession",
    ]);
  });

  it("keeps operation ledger state behind its transaction coordinator", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../infrastructure/server/operations/operationLedger.ts",
        importPath: "./operationLedgerState",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerState.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/server/operations/operationLedgerStore.ts",
        importPath: "./operationLedgerState",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerState.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/api/sync/handlers.ts",
        importPath: "../../operations/operationLedgerState",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerState.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "operation ledger state composition boundary: ../../infrastructure/server/operations/operationLedger.ts imports ./operationLedgerState",
      "operation ledger state composition boundary: ../../infrastructure/server/api/sync/handlers.ts imports ../../operations/operationLedgerState",
    ]);
  });

  it("keeps operation ledger internals behind their explicit composition root", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../infrastructure/server/operations/agentOperationLedger.ts",
        importPath: "./operationLedgerStore",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerStore.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/api/sync/handlers.ts",
        importPath: "../../operations/operationLedgerStore",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerStore.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/server/operations/trustedClientOperationLedger.ts",
        importPath: "./operationLedgerProjection",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerProjection.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/api/sync/handlers.ts",
        importPath: "../../operations/operationLedgerProjection",
        targetPath:
          "../../infrastructure/server/operations/operationLedgerProjection.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/server/operations/operationLedger.ts",
        importPath: "./agentOperationLedger",
        targetPath:
          "../../infrastructure/server/operations/agentOperationLedger.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/api/sync/handlers.ts",
        importPath: "../../operations/agentOperationLedger",
        targetPath:
          "../../infrastructure/server/operations/agentOperationLedger.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/server/operations/operationLedger.ts",
        importPath: "./trustedClientOperationLedger",
        targetPath:
          "../../infrastructure/server/operations/trustedClientOperationLedger.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath: "../../infrastructure/server/api/sync/handlers.ts",
        importPath: "../../operations/trustedClientOperationLedger",
        targetPath:
          "../../infrastructure/server/operations/trustedClientOperationLedger.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "operation ledger store boundary: ../../infrastructure/server/api/sync/handlers.ts imports ../../operations/operationLedgerStore",
      "operation ledger projection boundary: ../../infrastructure/server/api/sync/handlers.ts imports ../../operations/operationLedgerProjection",
      "Agent operation ledger composition boundary: ../../infrastructure/server/api/sync/handlers.ts imports ../../operations/agentOperationLedger",
      "trusted-client operation ledger composition boundary: ../../infrastructure/server/api/sync/handlers.ts imports ../../operations/trustedClientOperationLedger",
    ]);
  });

  it("keeps local-first projection state behind its repository", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../infrastructure/client/repository/resilientVersionedRepository.ts",
        importPath: "./resilientVersionedRepositoryProjection",
        targetPath:
          "../../infrastructure/client/repository/resilientVersionedRepositoryProjection.ts",
        targetRoot: "infrastructure",
      },
      {
        filePath:
          "../../infrastructure/client/http/journalRepository.ts",
        importPath: "../repository/resilientVersionedRepositoryProjection",
        targetPath:
          "../../infrastructure/client/repository/resilientVersionedRepositoryProjection.ts",
        targetRoot: "infrastructure",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "local-first repository projection composition boundary: ../../infrastructure/client/http/journalRepository.ts imports ../repository/resilientVersionedRepositoryProjection",
    ]);
  });

  it("keeps Syntax Activity React views on the application projection boundary", () => {
    const violations = auditImportPolicies([
      {
        filePath:
          "../../presentation/activities/syntax/SyntaxRuleField.tsx",
        importPath: "../../../core/ctn/syntax/schema",
        targetPath: "../../core/ctn/syntax/schema.ts",
        targetRoot: "core",
      },
      {
        filePath:
          "../../presentation/activities/syntax/syntaxDraftPersistence.ts",
        importPath: "../../../core/ctn/syntax/draft",
        targetPath: "../../core/ctn/syntax/draft.ts",
        targetRoot: "core",
      },
      {
        filePath:
          "../../presentation/activities/syntax/SyntaxMainPanel.tsx",
        importPath: "../../../application/syntax/syntaxProjection",
        targetPath: "../../application/syntax/syntaxProjection.ts",
        targetRoot: "application",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "Syntax Activity views consume application projection: ../../presentation/activities/syntax/SyntaxRuleField.tsx imports ../../../core/ctn/syntax/schema",
    ]);
  });

  it("allows cross-domain application coordination only in explicit roots", () => {
    const imports = [
      {
        filePath: "../../application/implicit/coordinator.ts",
        importPath: "../workspace/service",
        targetPath: "../../application/workspace/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/implicit/coordinator.ts",
        importPath: "../journal/service",
        targetPath: "../../application/journal/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/workbench/coordinator.ts",
        importPath: "../todo/service",
        targetPath: "../../application/todo/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/workbench/coordinator.ts",
        importPath: "../workspace/service",
        targetPath: "../../application/workspace/service.ts",
        targetRoot: "application" as const,
      },
    ];

    expect(auditApplicationCoordinationRoots(imports)).toEqual([
      "cross-domain application coordination: ../../application/implicit/coordinator.ts imports journal, workspace",
    ]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
