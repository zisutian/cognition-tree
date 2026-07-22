import { describe, expect, it, vi } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../../ctn/syntax/defaultSyntaxProfile";
import { createSyntaxProfileDraft } from "../../../../ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../../ctn/syntax/profileToml";
import {
  findSyntaxCatalogNameConflict,
  isCurrentSyntaxPersistenceCompletion,
  resolveSyntaxDraftAfterPersistence,
  startSyntaxCatalogMutation,
  startSyntaxDraftPersistence,
  startSyntaxFileDraftPersistence,
} from "../../../../src/application/workspace/runtime/useSyntaxRuntime";

const renamedSyntaxProfile = {
  ...defaultCtnSyntaxProfile,
  name: "重命名语法",
};

describe("startSyntaxDraftPersistence", () => {
  it("starts persistence synchronously for a valid changed draft", async () => {
    const draft = createSyntaxProfileDraft(renamedSyntaxProfile);
    const expectedSource = formatSyntaxProfileToml(renamedSyntaxProfile);
    const persistedSources: string[] = [];

    const persistence = startSyntaxDraftPersistence({
      draft,
      lastPersistedSource: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
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

    const persistence = startSyntaxDraftPersistence({
      draft: {
        ...createSyntaxProfileDraft(defaultCtnSyntaxProfile),
        name: "",
      },
      lastPersistedSource: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
      persist,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(persistence).toEqual({ completion: null, source: null });
  });

  it("turns a synchronous persistence throw into a rejected completion", async () => {
    const failure = new Error("synchronous failure");

    const persistence = startSyntaxDraftPersistence({
      draft: createSyntaxProfileDraft(renamedSyntaxProfile),
      lastPersistedSource: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
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
    const conflictingDraft = createSyntaxProfileDraft({
      ...defaultCtnSyntaxProfile,
      name: "  ALPHA  ",
    });

    expect(findSyntaxCatalogNameConflict({
      selectedFileId: "syntax-active",
      candidateName: "  ALPHA  ",
      files,
    })).toContain("重名");
    const blockedPersistence = startSyntaxFileDraftPersistence({
      selectedFileId: "syntax-active",
      draft: conflictingDraft,
      files,
      lastPersistedSource: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
      persist,
    });

    expect(blockedPersistence.catalogNameConflictMessage).toContain("重名");
    expect(blockedPersistence.completion).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    await expect(startSyntaxCatalogMutation({
      draftIsValid: !blockedPersistence.catalogNameConflictMessage,
      mutate,
    })).rejects.toThrow("请先修复或撤销");
    expect(mutate).not.toHaveBeenCalled();

    const fixedPersistence = startSyntaxFileDraftPersistence({
      selectedFileId: "syntax-active",
      draft: createSyntaxProfileDraft({
        ...defaultCtnSyntaxProfile,
        name: "Beta",
      }),
      files,
      lastPersistedSource: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
      persist,
    });

    expect(fixedPersistence.catalogNameConflictMessage).toBe("");
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
    const currentDraft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const syntaxSource = formatSyntaxProfileToml(defaultCtnSyntaxProfile);

    expect(
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource: syntaxSource,
        syntaxProfile: defaultCtnSyntaxProfile,
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
    const currentDraft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);

    expect(
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource: formatSyntaxProfileToml(
          defaultCtnSyntaxProfile,
        ),
        syntaxProfile: renamedSyntaxProfile,
        syntaxSource: formatSyntaxProfileToml(renamedSyntaxProfile),
      }).name,
    ).toBe("重命名语法");
  });

  it("does not overwrite a diverged invalid draft after persistence", () => {
    const currentDraft = {
      ...createSyntaxProfileDraft(defaultCtnSyntaxProfile),
      name: "",
    };

    expect(
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource: formatSyntaxProfileToml(
          defaultCtnSyntaxProfile,
        ),
        syntaxProfile: renamedSyntaxProfile,
        syntaxSource: formatSyntaxProfileToml(renamedSyntaxProfile),
      }),
    ).toBe(currentDraft);
  });
});
