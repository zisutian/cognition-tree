import type { SourceModules } from "./moduleImports";
import type {
  TextCorpus,
  TextPolicy,
} from "../support/textPolicy";

type UniqueOwner = readonly [
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  allowedPath: NonNullable<TextPolicy["allowedPath"]>,
  scope?: TextPolicy["scope"],
];

export function createOwnershipTextPolicies({
  applicationModules,
  contractModules,
  infrastructureModules,
  presentationModules,
  sourceModules,
}: {
  applicationModules: SourceModules;
  contractModules: SourceModules;
  infrastructureModules: SourceModules;
  presentationModules: SourceModules;
  sourceModules: SourceModules;
}): readonly TextPolicy[] {
  const uniqueOwners: readonly UniqueOwner[] = [
    [
      "CTN API request dispatch",
      contractModules,
      /\bexport function parseApiOperationRequest\s*\(/,
      /^contracts\/api\/registry\.ts$/,
    ],
    [
      "CTN token parsing",
      sourceModules,
      /\bparseCtnSourceText\s*\(/,
      /^core\/ctn\/analysis\//,
      (filePath) => !filePath.startsWith("core/ctn/parser/"),
    ],
    [
      "editor CTN analysis",
      presentationModules,
      /\banalyzeCtnSource\s*\(/,
      /^presentation\/editor\//,
    ],
    [
      "workspace analysis scan",
      applicationModules,
      /\bindex\.createScan\s*\(/,
      /^application\/workspace\/analysis\//,
    ],
    [
      "cross-domain search execution",
      applicationModules,
      /\bexport function createSearchQuery\s*</,
      /^application\/search\/searchIndex\.ts$/,
    ],
    [
      "Activity descriptor catalog",
      presentationModules,
      /\bexport const activityDescriptors\b/,
      /^presentation\/activities\/activityCatalog\.ts$/,
    ],
    [
      "authenticated workbench ProblemCenter",
      presentationModules,
      /\bcreateProblemCenter(?:<[^>]+>)?\s*\(/,
      /^presentation\/shell\/AuthenticatedWorkbenchRoot\.tsx$/,
    ],
    [
      "filesystem persistence primitives",
      infrastructureModules,
      /function (?:fsyncDirectory|writeFileDurably)\s*\(/,
      /^infrastructure\/server\/persistence\//,
    ],
    [
      "Agent proposal exact commit",
      infrastructureModules,
      /\bcommitAgentProposalExactly\s*\(/,
      /^infrastructure\/server\/agent\/proposalCommitter\.ts$/,
    ],
    [
      "Agent context limit signal",
      sourceModules,
      /\bclass AgentContextLimitError\b/,
      /^application\/agent\/agentRuntimePort\.ts$/,
    ],
    [
      "Agent runtime protocol error",
      sourceModules,
      /\bclass AgentRuntimeProtocolError\b/,
      /^application\/agent\/agentRuntimePort\.ts$/,
    ],
    [
      "Agent compatible chat protocol classification",
      infrastructureModules,
      /\bexport function classifySingleJsonToolCall\s*\(/,
      /^infrastructure\/server\/agent\/openAiChatProtocol\.ts$/,
    ],
    [
      "Agent compatible chat session lifecycle",
      infrastructureModules,
      /\bclass OpenAiCompatibleRuntimeSession\b/,
      /^infrastructure\/server\/agent\/openAiCompatibleSession\.ts$/,
    ],
    [
      "operation ledger idempotency error",
      infrastructureModules,
      /\bclass AgentOperationIdempotencyError\b/,
      /^infrastructure\/server\/operations\/operationLedgerContract\.ts$/,
    ],
    [
      "operation ledger indeterminate error",
      infrastructureModules,
      /\bclass AgentOperationIndeterminateError\b/,
      /^infrastructure\/server\/operations\/operationLedgerContract\.ts$/,
    ],
    [
      "operation ledger unavailable error",
      infrastructureModules,
      /\bclass OperationAuditUnavailableError\b/,
      /^infrastructure\/server\/operations\/operationLedgerContract\.ts$/,
    ],
    [
      "operation ledger finalize error",
      infrastructureModules,
      /\bclass OperationAuditFinalizeError\b/,
      /^infrastructure\/server\/operations\/operationLedgerContract\.ts$/,
    ],
    [
      "operation ledger attempt contract",
      infrastructureModules,
      /\bexport type AgentOperationAttempt\b/,
      /^infrastructure\/server\/operations\/operationLedgerContract\.ts$/,
    ],
    [
      "operation ledger state parser",
      infrastructureModules,
      /\bexport function parseOperationLedgerState\s*\(/,
      /^infrastructure\/server\/operations\/operationLedgerState\.ts$/,
    ],
    [
      "operation ledger composition root",
      infrastructureModules,
      /\bclass OperationLedger\b/,
      /^infrastructure\/server\/operations\/operationLedger\.ts$/,
    ],
    [
      "Agent operation ledger coordinator",
      infrastructureModules,
      /\bclass AgentOperationLedger\b/,
      /^infrastructure\/server\/operations\/agentOperationLedger\.ts$/,
    ],
    [
      "trusted-client operation ledger coordinator",
      infrastructureModules,
      /\bclass TrustedClientOperationLedger\b/,
      /^infrastructure\/server\/operations\/trustedClientOperationLedger\.ts$/,
    ],
    [
      "operation ledger store coordinator",
      infrastructureModules,
      /\bclass OperationLedgerStore\b/,
      /^infrastructure\/server\/operations\/operationLedgerStore\.ts$/,
    ],
    [
      "operation ledger stable key",
      infrastructureModules,
      /\bexport function operationLedgerKey\s*\(/,
      /^infrastructure\/server\/operations\/operationLedgerProjection\.ts$/,
    ],
    [
      "operation ledger trusted audit projection",
      infrastructureModules,
      /\bexport function createTrustedClientAuditEntry\s*\(/,
      /^infrastructure\/server\/operations\/operationLedgerProjection\.ts$/,
    ],
    [
      "local-first repository projection state",
      applicationModules,
      /\bclass LocalFirstRepositoryProjectionState\b/,
      /^application\/persistence\/localFirst\/localFirstRepositoryProjection\.ts$/,
    ],
    [
      "local repository deletion transaction",
      infrastructureModules,
      /\bexport async function deleteLocalRepositoryDirectory\s*\(/,
      /^infrastructure\/server\/repository\/workspace\/local\/localRepositoryDeletion\.ts$/,
    ],
    [
      "local repository deletion phases",
      infrastructureModules,
      /\bexport const localRepositoryDeletionPhases\b/,
      /^infrastructure\/server\/repository\/workspace\/local\/localRepositoryDeletion\.ts$/,
    ],
    [
      "local repository inventory scan",
      infrastructureModules,
      /\bexport async function readLocalRepositoryCatalog\s*\(/,
      /^infrastructure\/server\/repository\/workspace\/local\/localRepositoryInventory\.ts$/,
    ],
    [
      "local repository root lease",
      infrastructureModules,
      /\bclass LocalRepositoryRootLease\b/,
      /^infrastructure\/server\/repository\/workspace\/local\/localRepositoryRootLease\.ts$/,
    ],
    [
      "data-root migration authoritative partitions",
      infrastructureModules,
      /\bconst authoritativePartitions\b/,
      /^infrastructure\/server\/system\/dataRootMigrationFiles\.ts$/,
    ],
    [
      "data-root migration state coordinator",
      infrastructureModules,
      /\bclass FileDataRootMigrationCoordinator\b/,
      /^infrastructure\/server\/system\/dataRootMigrationCoordinator\.ts$/,
    ],
    [
      "Agent Profile turn queue",
      infrastructureModules,
      /\bnew AgentProfileTurnQueue\s*\(/,
      /^infrastructure\/server\/agent\/conversationRunner\.ts$/,
    ],
    [
      "Agent session resident registry",
      infrastructureModules,
      /\bnew Map<string, AgentSessionRecord>\s*\(/,
      /^infrastructure\/server\/agent\/sessionPool\.ts$/,
    ],
    [
      "Agent session runtime stop",
      infrastructureModules,
      /\bruntimeStopPromise\s*\?\?=/,
      /^infrastructure\/server\/agent\/sessionPool\.ts$/,
    ],
    [
      "Agent Proposal owner decision",
      infrastructureModules,
      /\bdecideAgentProposal\s*\(/,
      /^infrastructure\/server\/agent\/proposalWorkflow\.ts$/,
    ],
    [
      "Agent Proposal destruction confirmation",
      infrastructureModules,
      /\bconfirmAgentProposalDestruction\s*\(/,
      /^infrastructure\/server\/agent\/proposalWorkflow\.ts$/,
    ],
    [
      "Agent session runtime open",
      infrastructureModules,
      /\bruntimePort\.openSession\s*\(/,
      /^infrastructure\/server\/agent\/sessionOpener\.ts$/,
    ],
    [
      "Agent session private IPC capability",
      infrastructureModules,
      /\bthis\.#ipc\.register\s*\(/,
      /^infrastructure\/server\/agent\/sessionOpener\.ts$/,
    ],
    [
      "Agent configuration conflict error",
      infrastructureModules,
      /\bclass AgentConfigurationConflictError\b/,
      /^infrastructure\/server\/agent\/configurationErrors\.ts$/,
    ],
    [
      "Agent configuration validation error",
      infrastructureModules,
      /\bclass AgentConfigurationValidationError\b/,
      /^infrastructure\/server\/agent\/configurationErrors\.ts$/,
    ],
    [
      "Agent Provider input normalization",
      infrastructureModules,
      /\bexport function normalizeProviderInput\s*\(/,
      /^infrastructure\/server\/agent\/configurationInput\.ts$/,
    ],
    [
      "Agent Profile input normalization",
      infrastructureModules,
      /\bexport function normalizeProfileInput\s*\(/,
      /^infrastructure\/server\/agent\/configurationInput\.ts$/,
    ],
    [
      "Agent configuration snapshot projection",
      infrastructureModules,
      /\bexport function configurationSnapshot\s*\(/,
      /^infrastructure\/server\/agent\/configurationViews\.ts$/,
    ],
    [
      "Agent configuration revision assertion",
      infrastructureModules,
      /\bexport function assertAgentConfigurationRevision\s*\(/,
      /^infrastructure\/server\/agent\/configurationRevision\.ts$/,
    ],
    [
      "Agent Profile configuration coordinator",
      infrastructureModules,
      /\bnew AgentProfileConfiguration\s*\(/,
      /^infrastructure\/server\/agent\/configurationStore\.ts$/,
    ],
    [
      "Agent Provider configuration coordinator",
      infrastructureModules,
      /\bnew AgentProviderConfiguration\s*\(/,
      /^infrastructure\/server\/agent\/configurationStore\.ts$/,
    ],
    [
      "Agent Provider conformance invalidation",
      infrastructureModules,
      /\bfunction invalidateProviderConformance\s*\(/,
      /^infrastructure\/server\/agent\/providerConfiguration\.ts$/,
    ],
    [
      "CTN tone class projection",
      presentationModules,
      /`ctn-tone-\$\{tone\}`/,
      /^presentation\/ui\/shared\//,
    ],
    [
      "CTN custom tone projection",
      presentationModules,
      /`--ctn-tone-color: \$\{tone\};`/,
      /^presentation\/ui\/shared\//,
    ],
  ];

  return [
    ...uniqueOwners.map(([name, corpus, pattern, allowedPath, scope]) => ({
      allowedPath,
      corpus,
      matches: 1,
      name,
      pattern,
      scope,
    })),
    {
      allowedPath:
        /^contracts\/api\/operations\/(?:admin|agent|auth|content|foundation|sync)\.ts$/,
      corpus: contractModules,
      matches: { min: 1 },
      name: "CTN API v3 feature operation declarations",
      pattern: /\bpath:\s*"\/api\/v3\//,
    },
    {
      allowedPath: /^core\/ctn\/(?:metadata|parser)\//,
      corpus: sourceModules,
      matches: { min: 1 },
      name: "CTN metadata interpretation",
      pattern: /\bparseCtnBlockMetadataLine\s*\(/,
    },
    {
      allowedPath:
        /^infrastructure\/server\/agent\/sessionMcpServer\.ts$/,
      corpus: sourceModules,
      matches: 1,
      name: "private Agent child process environment ingress",
      pattern: /\bprocess\.env\b/,
    },
    {
      corpus: applicationModules,
      matches: 0,
      name: "presentation contracts in application projections",
      pattern:
        /\b(?:className|CSSProperties)\b|(?:ctn-tone-|ctn-text-color-|--ctn-)/,
      scope: /^application\/workspace\/projection\//,
    },
    {
      corpus: presentationModules,
      matches: 0,
      name: "Search Activity CTN parsing",
      pattern:
        /\b(?:analyzeCtnSource|parseCtnSourceText|create(?:Journal|Todo|Workspace)ParseIndex)\s*\(/,
      scope: /^presentation\/activities\/search\//,
    },
    {
      corpus: presentationModules,
      matches: 0,
      name: "canonical content preparation in presentation",
      pattern:
        /\b(?:parseWorkspaceSyntax|create(?:Journal|Todo|Workspace)ParseIndex|validate(?:Journal|Todo)Content(?:Analysis|Transition|AnalysisTransition)?)\s*\(/,
    },
    {
      corpus: sourceModules,
      matches: 0,
      name: "runtime content migrations outside the system control plane",
      pattern: /\b(?:migrate|migration)(?:[A-Z_]|[a-z]+\b)/i,
      scope:
        /^(?:core|application\/(?:workspace|journal|todo)|infrastructure\/server\/repository)\//,
    },
  ];
}
