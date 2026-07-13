import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../../src/ctn/syntax/defaultSyntaxProfile";
import { createSyntaxProfileDraft } from "../../../../src/ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../../src/ctn/syntax/profileToml";
import { resolveSyntaxDraftAfterPersistence } from "../../../../src/application/workspace/runtime/useSyntaxRuntime";

const renamedSyntaxProfile = {
  ...defaultCtnSyntaxProfile,
  name: "重命名语法",
};

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
