import type { SourceModules } from "./moduleImports";
import type {
  SourceImport,
  SourceRoot,
} from "./sourceArchitecture";
import type { TextPolicy } from "../support/textPolicy";

export type ImportPolicy = {
  allows(edge: SourceImport): boolean;
  applies?(edge: SourceImport): boolean;
  name: string;
};

export const sourceLayerImports: Readonly<
  Record<SourceRoot, readonly SourceRoot[]>
> = {
  application: ["application", "core"],
  contracts: ["contracts"],
  core: ["core"],
  infrastructure: ["infrastructure", "application", "contracts", "core"],
  presentation: ["presentation", "infrastructure", "application", "core"],
};

const serverAreaImports: Readonly<Record<string, readonly string[]>> = {
  access: ["access", "state"],
  agent: [
    "agent",
    "api",
    "api/http",
    "api/resources",
    "api/sync",
    "operations",
    "repository",
    "state",
  ],
  api: ["api", "api/http", "api/resources", "repository"],
  "api/http": [
    "access",
    "agent",
    "api",
    "api/http",
    "api/resources",
    "api/sync",
    "network",
    "operations",
    "repository",
  ],
  "api/resources": ["api/resources"],
  "api/sync": [
    "api/http",
    "api/sync",
    "operations",
    "repository",
  ],
  catalog: ["catalog", "repository"],
  network: ["network"],
  operations: ["operations", "state"],
  persistence: ["persistence"],
  repository: ["persistence", "repository"],
  state: ["persistence", "state"],
  system: ["network", "persistence", "state", "system"],
};

const clientAreaImports: Readonly<Record<string, readonly string[]>> = {
  http: ["http", "repository"],
  platform: ["platform"],
  repository: ["repository"],
  runtime: ["http", "platform", "repository", "runtime"],
};

const agentProviderOperationFacadePath =
  "../../infrastructure/server/agent/providerOperations.ts";
const agentProviderOperationFacadeTargets: ReadonlySet<string> = new Set([
  "../../infrastructure/server/agent/codexDeviceLoginOperations.ts",
  "../../infrastructure/server/agent/configurationStore.ts",
  "../../infrastructure/server/agent/conformanceOperations.ts",
  "../../infrastructure/server/agent/providerOperationErrors.ts",
  "../../infrastructure/server/agent/providerProbe.ts",
  "../../infrastructure/server/agent/providerTargetPolicy.ts",
  "../../infrastructure/server/api/http/runtime.ts",
]);
const agentConversationRunnerPath =
  "../../infrastructure/server/agent/conversationRunner.ts";
const agentSessionPoolPath =
  "../../infrastructure/server/agent/sessionPool.ts";
const agentProposalWorkflowPath =
  "../../infrastructure/server/agent/proposalWorkflow.ts";
const agentSessionOpenerPath =
  "../../infrastructure/server/agent/sessionOpener.ts";
const agentProfileConfigurationPath =
  "../../infrastructure/server/agent/profileConfiguration.ts";
const agentProviderConfigurationPath =
  "../../infrastructure/server/agent/providerConfiguration.ts";
const agentConfigurationStorePath =
  "../../infrastructure/server/agent/configurationStore.ts";
const agentOpenAiChatProtocolPath =
  "../../infrastructure/server/agent/openAiChatProtocol.ts";
const agentOpenAiCompatibleSessionPath =
  "../../infrastructure/server/agent/openAiCompatibleSession.ts";
const agentOpenAiCompatibleSessionConsumers: ReadonlySet<string> = new Set([
  "../../infrastructure/server/agent/ollamaRuntime.ts",
  "../../infrastructure/server/agent/openAiChatRuntime.ts",
]);
const agentServicePath = "../../infrastructure/server/agent/service.ts";
const operationLedgerStorePath =
  "../../infrastructure/server/operations/operationLedgerStore.ts";
const operationLedgerStatePath =
  "../../infrastructure/server/operations/operationLedgerState.ts";
const operationLedgerStateConsumers: ReadonlySet<string> = new Set([
  operationLedgerStorePath,
]);

function peerDomain(filePath: string) {
  return filePath.match(
    /^(?:\.\.\/\.\.\/)?(?:core|application)\/(workspace|journal|todo)\//,
  )?.[1] ?? null;
}

function isConcreteDomainPath(filePath: string) {
  return /^\.\.\/\.\.\/(?:application|core)\/(?:workspace|journal|todo)\//
    .test(filePath);
}

function isConcreteDomainModule(filePath: string) {
  return /^\.\.\/\.\.\/(?:application|contracts|core)\/(?:workspace|journal|todo)\//
    .test(filePath);
}

function isGenericClientHttpModule(filePath: string) {
  return [
    "../../infrastructure/client/http/apiTransport.ts",
    "../../infrastructure/client/http/httpRepositoryIdentity.ts",
    "../../infrastructure/client/http/versionedContentRepository.ts",
  ].includes(filePath);
}

function isCoreCommandModule(filePath: string) {
  return /^\.\.\/\.\.\/core\/.+\/commands\//.test(filePath);
}

function isSyntaxActivityReactView(filePath: string) {
  return filePath.startsWith("../../presentation/activities/syntax/") &&
    filePath.endsWith(".tsx");
}

function isCoreSyntaxModule(filePath: string) {
  return filePath.startsWith("../../core/ctn/syntax/");
}

function isApplicationArea(filePath: string, area: string) {
  return filePath.startsWith(`../../application/${area}/`);
}

function serverArea(filePath: string) {
  const prefix = "../../infrastructure/server/";

  if (!filePath.startsWith(prefix)) return null;
  const segments = filePath.slice(prefix.length).split("/");

  return segments[0] === "adapters"
    ? `adapters/${segments[1]}`
    : segments[0] === "api" && !segments[1]?.endsWith(".ts")
      ? `api/${segments[1]}`
      : segments[0];
}

function clientArea(filePath: string) {
  const prefix = "../../infrastructure/client/";

  return filePath.startsWith(prefix)
    ? filePath.slice(prefix.length).split("/")[0] ?? null
    : null;
}

function isRefinedInfrastructureEdge(edge: SourceImport) {
  return (
    (clientArea(edge.filePath) !== null &&
      clientArea(edge.targetPath) !== null) ||
    (edge.filePath !== "../../infrastructure/server/index.ts" &&
      serverArea(edge.filePath) !== null &&
      serverArea(edge.targetPath) !== null)
  );
}

function allowsInfrastructureEdge(edge: SourceImport) {
  const sourceClientArea = clientArea(edge.filePath);

  if (sourceClientArea !== null) {
    return clientAreaImports[sourceClientArea]?.includes(
      clientArea(edge.targetPath) ?? "",
    ) ?? false;
  }
  const allowed = serverAreaImports[serverArea(edge.filePath) ?? ""];

  return allowed?.includes(serverArea(edge.targetPath) ?? "") ?? false;
}

export function createDependencyImportPolicies({
  getSourceRoot,
}: {
  getSourceRoot(filePath: string): SourceRoot;
}): readonly ImportPolicy[] {
  return [
    {
      allows: ({ filePath, targetRoot }) =>
        sourceLayerImports[getSourceRoot(filePath)].includes(targetRoot),
      name: "five-layer direction",
    },
    {
      allows: ({ filePath, targetPath }) =>
        peerDomain(filePath) === peerDomain(targetPath),
      applies: ({ filePath, targetPath }) =>
        peerDomain(filePath) !== null && peerDomain(targetPath) !== null,
      name: "peer domain isolation",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        isApplicationArea(filePath, "repository") &&
        isConcreteDomainPath(targetPath),
      name: "repository independence from domain content",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        (isApplicationArea(filePath, "persistence") ||
          isApplicationArea(filePath, "sync")) &&
        isConcreteDomainPath(targetPath),
      name: "generic persistence and sync independence from domains",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        isGenericClientHttpModule(filePath) &&
        isConcreteDomainModule(targetPath),
      name: "generic client HTTP independence from domains",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        filePath.startsWith("../../infrastructure/server/api/") &&
        isCoreCommandModule(targetPath),
      name: "server API independence from core commands",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        filePath ===
          "../../infrastructure/server/agent/sessionTools.ts" &&
        isConcreteDomainModule(targetPath),
      name: "Agent session tool coordinator independence from domains",
    },
    {
      allows: ({ targetPath }) =>
        agentProviderOperationFacadeTargets.has(targetPath),
      applies: ({ filePath }) => filePath === agentProviderOperationFacadePath,
      name: "Agent Provider operation facade composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentServicePath,
      applies: ({ targetPath }) => targetPath === agentConversationRunnerPath,
      name: "Agent conversation composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentServicePath,
      applies: ({ targetPath }) => targetPath === agentSessionPoolPath,
      name: "Agent session pool composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentServicePath,
      applies: ({ targetPath }) => targetPath === agentProposalWorkflowPath,
      name: "Agent Proposal workflow composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentServicePath,
      applies: ({ targetPath }) => targetPath === agentSessionOpenerPath,
      name: "Agent session opener composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentConfigurationStorePath,
      applies: ({ targetPath }) => targetPath === agentProfileConfigurationPath,
      name: "Agent Profile configuration composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentConfigurationStorePath,
      applies: ({ targetPath }) => targetPath === agentProviderConfigurationPath,
      name: "Agent Provider configuration composition boundary",
    },
    {
      allows: ({ filePath }) => filePath === agentOpenAiCompatibleSessionPath,
      applies: ({ targetPath }) => targetPath === agentOpenAiChatProtocolPath,
      name: "Agent compatible chat protocol boundary",
    },
    {
      allows: ({ filePath }) =>
        agentOpenAiCompatibleSessionConsumers.has(filePath),
      applies: ({ targetPath }) =>
        targetPath === agentOpenAiCompatibleSessionPath,
      name: "Agent compatible chat session composition boundary",
    },
    {
      allows: ({ filePath }) => operationLedgerStateConsumers.has(filePath),
      applies: ({ targetPath }) => targetPath === operationLedgerStatePath,
      name: "operation ledger state composition boundary",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        (isApplicationArea(filePath, "agent") &&
          isApplicationArea(targetPath, "workbench")) ||
        (isApplicationArea(filePath, "workbench") &&
          isApplicationArea(targetPath, "agent")),
      name: "application coordination root independence",
    },
    {
      allows: allowsInfrastructureEdge,
      applies: isRefinedInfrastructureEdge,
      name: "infrastructure sublayer direction",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        filePath.startsWith("../../presentation/activities/") &&
        targetPath.startsWith("../../presentation/shell/"),
      name: "Activity independence from shell composition",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        isSyntaxActivityReactView(filePath) &&
        isCoreSyntaxModule(targetPath),
      name: "Syntax Activity views consume application projection",
    },
    {
      allows: () => false,
      applies: ({ filePath, targetPath }) =>
        !filePath.startsWith("../../infrastructure/server/") &&
        targetPath.startsWith("../../infrastructure/server/"),
      name: "browser-to-server API boundary",
    },
  ];
}

export function auditImportPolicies(
  imports: readonly SourceImport[],
  policies: readonly ImportPolicy[],
) {
  return policies.flatMap((policy) =>
    imports
      .filter((edge) => policy.applies?.(edge) ?? true)
      .filter((edge) => !policy.allows(edge))
      .map(({ filePath, importPath }) =>
        `${policy.name}: ${filePath} imports ${importPath}`
      )
  );
}

export function auditApplicationCoordinationRoots(
  imports: readonly SourceImport[],
) {
  const domainsByFile = new Map<string, Set<string>>();

  for (const { filePath, targetPath } of imports) {
    if (!filePath.startsWith("../../application/")) continue;
    const domain = targetPath.match(
      /^\.\.\/\.\.\/(?:application|core)\/(workspace|journal|todo)\//,
    )?.[1];

    if (!domain) continue;
    const domains = domainsByFile.get(filePath) ?? new Set<string>();

    domains.add(domain);
    domainsByFile.set(filePath, domains);
  }
  return [...domainsByFile]
    .filter(([filePath, domains]) =>
      domains.size > 1 &&
      !filePath.startsWith("../../application/workbench/") &&
      !filePath.startsWith("../../application/agent/")
    )
    .map(([filePath, domains]) =>
      `cross-domain application coordination: ${filePath} imports ${
        [...domains].sort().join(", ")
      }`
    )
    .sort();
}

export function createDependencyTextPolicies({
  applicationModules,
  sourceImportCorpus,
}: {
  applicationModules: SourceModules;
  sourceImportCorpus: SourceModules;
}): readonly TextPolicy[] {
  return [
    {
      allowedPath: /^presentation\//,
      corpus: sourceImportCorpus,
      matches: { min: 1 },
      name: "React runtime ownership",
      pattern: /^react(?:-dom)?(?:\/|$)/m,
    },
    {
      allowedPath: /^infrastructure\//,
      corpus: sourceImportCorpus,
      matches: { min: 1 },
      name: "Node runtime ownership",
      pattern: /^node:/m,
    },
    {
      allowedPath: /^core\/ctn\/syntax\//,
      corpus: sourceImportCorpus,
      matches: 1,
      name: "TOML compiler dependency",
      pattern: /^smol-toml$/m,
    },
    {
      corpus: applicationModules,
      matches: 0,
      name: "platform globals in application",
      pattern:
        /\bglobalThis\s*\.|(?:^|[^\w.])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/m,
    },
  ];
}
