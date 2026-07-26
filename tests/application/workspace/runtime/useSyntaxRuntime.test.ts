import { describe, expect, it, vi } from "vitest";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import { createCtnSyntaxDraft } from "../../../../core/ctn/syntax/draft";
import { formatCtnSyntaxV2 } from "../../../../core/ctn/syntax/formatter";
import { compileCtnSyntaxDefinition } from "../../../../core/ctn/syntax/compiler";
import {
  findSyntaxCatalogNameConflict,
  startSyntaxCatalogMutation,
} from "../../../../presentation/activities/bindings/workspace/runtime/useSyntaxRuntime";
import {
  isCurrentSyntaxPersistenceCompletion,
  resolveCtnSyntaxDraftAfterSourceChange,
  startCtnSyntaxDraftPersistence,
} from "../../../../presentation/activities/bindings/syntax/syntaxDraftPersistence";

const renamedResult = compileCtnSyntaxDefinition({
  ...structuredClone(defaultCtnSyntax.definition),
  name: "重命名语法",
}, "workspace");
if (!renamedResult.syntax) throw new Error("Invalid renamed test syntax.");
const renamedSyntax = renamedResult.syntax;

function formatWorkspaceSyntax(
  syntax = defaultCtnSyntax,
) {
  return formatCtnSyntaxV2(syntax.definition, "workspace");
}

describe("startSyntaxDraftPersistence", () => {
  it("starts persistence synchronously for a valid changed draft", async () => {
    const draft = createCtnSyntaxDraft(renamedSyntax);
    const expectedSource = formatWorkspaceSyntax(renamedSyntax);
    const persistedSources: string[] = [];

    const persistence = startCtnSyntaxDraftPersistence({
      draft,
      lastPersistedSource: formatWorkspaceSyntax(),
      owner: "workspace",
      persist: (source) => {
        persistedSources.push(source);
        return Promise.resolve();
      },
    });

    expect(persistedSources).toEqual([expectedSource]);
    expect(persistence.source).toBe(expectedSource);
    await expect(persistence.completion).resolves.toBeUndefined();
  });

  it("does not persist an invalid draft", () => {
    const persist = vi.fn(() => Promise.resolve());

    const persistence = startCtnSyntaxDraftPersistence({
      draft: {
        ...createCtnSyntaxDraft(defaultCtnSyntax),
        name: "",
      },
      lastPersistedSource: formatWorkspaceSyntax(),
      owner: "workspace",
      persist,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(persistence).toEqual({ completion: null, source: null });
  });

  it("turns a synchronous persistence throw into a rejected completion", async () => {
    const failure = new Error("synchronous failure");

    const persistence = startCtnSyntaxDraftPersistence({
      draft: createCtnSyntaxDraft(renamedSyntax),
      lastPersistedSource: formatWorkspaceSyntax(),
      owner: "workspace",
      persist: () => {
        throw failure;
      },
    });

    expect(persistence.completion).not.toBeNull();
    await expect(persistence.completion).rejects.toBe(failure);
  });
});

describe("startSyntaxCatalogMutation", () => {
  it("rejects catalog mutations while the active draft is invalid", async () => {
    const mutate = vi.fn(() => Promise.resolve());

    await expect(startSyntaxCatalogMutation({
      draftIsValid: false,
      mutate,
    })).rejects.toThrow("请先修复或撤销");
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("syntax catalog name conflicts", () => {
  it("normalizes NFKC, case, and whitespace before persistence and catalog mutation", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const mutate = vi.fn(() => Promise.resolve());
    const files = [
      { id: "syntax-active", name: "Current" },
      { id: "syntax-other", name: "Ａｌｐｈａ" },
    ];
    const conflictingResult = compileCtnSyntaxDefinition({
      ...structuredClone(defaultCtnSyntax.definition),
      name: "  ALPHA  ",
    }, "workspace");
    if (!conflictingResult.syntax) throw new Error("Invalid conflict syntax.");
    const conflictingDraft = createCtnSyntaxDraft(conflictingResult.syntax);

    expect(findSyntaxCatalogNameConflict({
      selectedFileId: "syntax-active",
      candidateName: "  ALPHA  ",
      files,
    })).toContain("重名");
    const conflictMessage = findSyntaxCatalogNameConflict({
      selectedFileId: "syntax-active",
      candidateName: conflictingResult.syntax.name,
      files,
    });
    const blockedPersistence = startCtnSyntaxDraftPersistence({
      canPersist: !conflictMessage,
      draft: conflictingDraft,
      lastPersistedSource: formatWorkspaceSyntax(),
      owner: "workspace",
      persist,
    });

    expect(conflictMessage).toContain("重名");
    expect(blockedPersistence.completion).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    await expect(startSyntaxCatalogMutation({
      draftIsValid: !conflictMessage,
      mutate,
    })).rejects.toThrow("请先修复或撤销");
    expect(mutate).not.toHaveBeenCalled();

    const fixedPersistence = startCtnSyntaxDraftPersistence({
      draft: createCtnSyntaxDraft(
        compileCtnSyntaxDefinition({
          ...structuredClone(defaultCtnSyntax.definition),
          name: "Beta",
        }, "workspace").syntax!,
      ),
      lastPersistedSource: formatWorkspaceSyntax(),
      owner: "workspace",
      persist,
    });

    await expect(fixedPersistence.completion).resolves.toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(startSyntaxCatalogMutation({
      draftIsValid: true,
      mutate,
    })).resolves.toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSyntaxDraftAfterPersistence", () => {
  it("keeps a draft that already matches the persisted source", () => {
    const currentDraft = createCtnSyntaxDraft(defaultCtnSyntax);
    const syntaxSource = formatWorkspaceSyntax();

    expect(
      resolveCtnSyntaxDraftAfterSourceChange({
        currentDraft,
        owner: "workspace",
        previousPersistedSource: syntaxSource,
        syntax: defaultCtnSyntax,
        syntaxSource,
      }),
    ).toBe(currentDraft);
  });

  it("rejects stale valid-draft completions by both version and source", () => {
    expect(
      isCurrentSyntaxPersistenceCompletion({
        active: true,
        completedSource: "version-1",
        completedVersion: 1,
        currentSource: "version-2",
        currentVersion: 2,
      }),
    ).toBe(false);
    expect(
      isCurrentSyntaxPersistenceCompletion({
        active: true,
        completedSource: "version-1",
        completedVersion: 2,
        currentSource: "version-2",
        currentVersion: 2,
      }),
    ).toBe(false);
    expect(
      isCurrentSyntaxPersistenceCompletion({
        active: true,
        completedSource: "version-2",
        completedVersion: 2,
        currentSource: "version-2",
        currentVersion: 2,
      }),
    ).toBe(true);
    expect(
      isCurrentSyntaxPersistenceCompletion({
        active: true,
        completedFileId: "syntax-a",
        completedSource: "version-2",
        completedVersion: 2,
        currentFileId: "syntax-b",
        currentSource: "version-2",
        currentVersion: 2,
      }),
    ).toBe(false);
  });

  it("updates a clean draft when an external persisted profile changes", () => {
    const currentDraft = createCtnSyntaxDraft(defaultCtnSyntax);

    expect(
      resolveCtnSyntaxDraftAfterSourceChange({
        currentDraft,
        owner: "workspace",
        previousPersistedSource: formatWorkspaceSyntax(),
        syntax: renamedSyntax,
        syntaxSource: formatWorkspaceSyntax(renamedSyntax),
      }).name,
    ).toBe("重命名语法");
  });

  it("does not overwrite a diverged invalid draft after persistence", () => {
    const currentDraft = {
      ...createCtnSyntaxDraft(defaultCtnSyntax),
      name: "",
    };

    expect(
      resolveCtnSyntaxDraftAfterSourceChange({
        currentDraft,
        owner: "workspace",
        previousPersistedSource: formatWorkspaceSyntax(),
        syntax: renamedSyntax,
        syntaxSource: formatWorkspaceSyntax(renamedSyntax),
      }),
    ).toBe(currentDraft);
  });
});
