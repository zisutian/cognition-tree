import { describe, expect, it } from "vitest";
import {
  applicationModules,
  contractModules,
  coreModules,
  ctnModules,
  ctnPathToRelative,
  infrastructureModules,
  listSourceFiles,
  presentationModules,
  serverModules,
  sourceModules,
  sourcePathToRelative,
} from "./sourceGraph";

const legacySourceModules = import.meta.glob(
  ["../../src/**/*.{ts,tsx}", "../../server/**/*.ts"],
  { eager: true, import: "default", query: "?raw" },
);

describe("semantic source ownership", () => {
  it("keeps canonical metadata interpretation inside the CTN parser", () => {
    const consumers = Object.entries(ctnModules)
      .filter(([, source]) => /\bparseCtnBlockMetadataLine\s*\(/.test(source))
      .map(([filePath]) => ctnPathToRelative(filePath))
      .filter(
        (filePath) =>
          filePath !== "metadata/blockMetadata.ts" &&
          !filePath.startsWith("parser/"),
      );
    const sourceInterpreters = Object.entries(sourceModules)
      .filter(([, source]) => /\bparseCtnBlockMetadataLine\s*\(/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));
    const serverInterpreters = Object.entries(serverModules)
      .filter(([, source]) =>
        /\b(?:metadataLinePattern|parseCtnBlockMetadataLine)\b|@ctn-block\s+id=/.test(
          source,
        ),
      )
      .map(([filePath]) => filePath.replace("../../infrastructure/server", ""));

    expect([
      ...consumers,
      ...sourceInterpreters,
      ...serverInterpreters,
    ]).toEqual([]);
  });

  it("keeps full-workspace parse scans owned by application analysis", () => {
    const owners = Object.entries(sourceModules)
      .filter(([, source]) => /\bindex\.createScan\s*\(/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(owners).toEqual([
      "application/workspace/analysis/workspaceAnalysisCollection.ts",
    ]);
  });

  it("keeps the parse-index hook private to the workspace analysis owner", () => {
    const consumers = Object.entries(sourceModules)
      .filter(
        ([filePath, source]) =>
          !filePath.endsWith("presentation/activities/bindings/workspace/runtime/useWorkspaceParseIndex.ts") &&
          /\buseWorkspaceParseIndex\s*\(/.test(source),
      )
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(consumers).toEqual([
      "presentation/activities/bindings/workspace/analysis/useWorkspaceAnalysis.ts",
    ]);
  });

  it("keeps projection modules free of presentation class contracts", () => {
    const violations = listSourceFiles("application/workspace/projection")
      .filter((filePath) =>
        /\b(?:className|CSSProperties)\b|(?:ctn-tone-|ctn-text-color-|--ctn-)/.test(
          sourceModules[filePath] ?? "",
        ),
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });

  it("uses the five repository-root layers without legacy source roots", () => {
    expect(Object.keys(applicationModules).length).toBeGreaterThan(0);
    expect(Object.keys(contractModules).length).toBeGreaterThan(0);
    expect(Object.keys(coreModules).length).toBeGreaterThan(0);
    expect(Object.keys(infrastructureModules).length).toBeGreaterThan(0);
    expect(Object.keys(presentationModules).length).toBeGreaterThan(0);
    expect(Object.keys(legacySourceModules)).toEqual([]);
  });

  it("keeps generic persistence outside repository management", () => {
    const repositoryFiles = listSourceFiles("application/repository")
      .map(sourcePathToRelative);
    const persistenceFiles = listSourceFiles("application/persistence")
      .map(sourcePathToRelative);

    expect(repositoryFiles).not.toEqual(expect.arrayContaining([
      "application/repository/versionedRepository.ts",
      "application/repository/versionedRepositorySaveQueue.ts",
      "application/repository/versionedSessionController.ts",
    ]));
    expect(persistenceFiles).toEqual(expect.arrayContaining([
      "application/persistence/versionedRepository.ts",
      "application/persistence/versionedRepositorySaveQueue.ts",
      "application/persistence/versionedSessionController.ts",
    ]));
  });

  it("contains no retired built-in v2 cleanup knowledge", () => {
    const v2Owners = Object.entries({
      ...sourceModules,
      ...contractModules,
    })
      .filter(([, source]) => /(?:schemaVersion\s*:\s*2|system-journal|system-todo)/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(v2Owners).toEqual([]);
  });

  it("has one owner for browser and filesystem persistence primitives", () => {
    const indexedDbOwners = Object.entries(infrastructureModules)
      .filter(([, source]) =>
        /function (?:requestResult|transactionComplete)\s*</.test(source)
      )
      .map(([filePath]) => sourcePathToRelative(filePath));
    const fileSystemOwners = Object.entries(infrastructureModules)
      .filter(([, source]) =>
        /function (?:fsyncDirectory|writeFileDurably)\s*\(/.test(source)
      )
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(indexedDbOwners).toEqual([
      "infrastructure/browser/indexedDbPrimitives.ts",
    ]);
    expect(fileSystemOwners).toEqual([
      "infrastructure/server/persistence/fileSystemPersistence.ts",
    ]);
    expect(Object.keys(infrastructureModules)).not.toContain(
      "../../infrastructure/server/adapters/local/atomicWrite.ts",
    );
    expect(Object.keys(infrastructureModules)).not.toContain(
      "../../infrastructure/server/repository/fileSystemError.ts",
    );
  });

  it("keeps Local and WebDAV adapter responsibilities in dedicated modules", () => {
    const ownersOf = (functionName: string) => Object.entries(
      infrastructureModules,
    )
      .filter(([, source]) => new RegExp(
        `(?:function|class)\\s+${functionName}\\s*(?:\\(|\\{)`,
      ).test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(ownersOf("parseLocalRepositoryMetadata")).toEqual([
      "infrastructure/server/adapters/local/localWorkingTreeCodec.ts",
    ]);
    expect(ownersOf("assertLocalRepositoryContainsOnlyManagedData")).toEqual([
      "infrastructure/server/adapters/local/localManagedDataGuard.ts",
    ]);
    expect(ownersOf("scanPhysicalWorkingTreeOnce")).toEqual([
      "infrastructure/server/adapters/local/localPhysicalWorkingTree.ts",
    ]);
    expect(ownersOf("planLocalWorkingTreeTransaction")).toEqual([
      "infrastructure/server/adapters/local/workingTreeTransactionPlanner.ts",
    ]);
    expect(ownersOf("parseLocalTransactionManifest")).toEqual([
      "infrastructure/server/adapters/local/workingTreeTransactionManifest.ts",
    ]);
    expect(ownersOf("captureLocalManagedWorkingTreeState")).toEqual([
      "infrastructure/server/adapters/local/workingTreeTransactionState.ts",
    ]);
    expect(ownersOf("applyLocalWorkingTreeTransaction")).toEqual([
      "infrastructure/server/adapters/local/workingTreeTransactionExecutor.ts",
    ]);
    expect(ownersOf("recoverLocalWorkingTreeTransactions")).toEqual([
      "infrastructure/server/adapters/local/workingTreeTransactionRecovery.ts",
    ]);
    expect(ownersOf("parseWebDavConnectionConfig")).toEqual([
      "infrastructure/server/adapters/webdav/webDavConnectionConfig.ts",
    ]);
    expect(ownersOf("WebDavRegistryLease")).toEqual([
      "infrastructure/server/adapters/webdav/webDavRegistryLease.ts",
    ]);
    expect(ownersOf("WebDavDeletionCoordinator")).toEqual([
      "infrastructure/server/adapters/webdav/webDavDeletionCoordinator.ts",
    ]);
    expect(ownersOf("loadWebDavConnectionConfigs")).toEqual([
      "infrastructure/server/adapters/webdav/webDavConnectionPersistence.ts",
    ]);
  });

  it("keeps API routing, transport, errors, and domain handlers separated", () => {
    const ownersOf = (functionName: string) => Object.entries(
      infrastructureModules,
    )
      .filter(([, source]) => new RegExp(
        `function\\s+${functionName}\\s*\\(`,
      ).test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(ownersOf("resolveWorkspaceApiRoute")).toEqual([
      "infrastructure/server/api/workspaceApiRoutes.ts",
    ]);
    expect(ownersOf("readWorkspaceApiJsonBody")).toEqual([
      "infrastructure/server/api/workspaceApiTransport.ts",
    ]);
    expect(ownersOf("mapWorkspaceApiError")).toEqual([
      "infrastructure/server/api/workspaceApiErrors.ts",
    ]);
    expect(ownersOf("handleBuiltInApiRoute")).toEqual([
      "infrastructure/server/api/builtInApiHandlers.ts",
    ]);
    expect(ownersOf("handleWorkspaceRepositoryApiRoute")).toEqual([
      "infrastructure/server/api/workspaceRepositoryApiHandlers.ts",
    ]);

    const server = infrastructureModules[
      "../../infrastructure/server/api/workspaceApiServer.ts"
    ] ?? "";

    expect(server).not.toMatch(
      /parseCreateRepository|parseRenameRepository|for await \(const chunk/,
    );
  });

  it("keeps presentation orchestration behind focused bindings and views", () => {
    const appRoot = presentationModules[
      "../../presentation/shell/AppRoot.tsx"
    ] ?? "";
    const repositoryPanel = presentationModules[
      "../../presentation/activities/views/repository/RepositoryPanel.tsx"
    ] ?? "";
    const graphCanvas = presentationModules[
      "../../presentation/activities/views/visualization/ReferenceGraphCanvas.tsx"
    ] ?? "";

    expect(appRoot).not.toMatch(
      /useJournalApplication|useTodoApplication|createRepositoryApplication|requestWorkspaceNoteDestination/,
    );
    expect(repositoryPanel).not.toMatch(
      /CompactContextRow|RepositoryDeleteConfirmation/,
    );
    expect(graphCanvas).not.toMatch(
      /ResizeObserver|MutationObserver|createReferenceGraphSimulation|useEffect/,
    );
    expect(Object.keys(presentationModules)).not.toContain(
      "../../presentation/activities/views/todo/TodoPanels.tsx",
    );
  });
});
