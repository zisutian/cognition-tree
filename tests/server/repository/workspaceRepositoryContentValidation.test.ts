import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile.ts";
import { formatSyntaxProfileToml } from "../../../ctn/syntax/profileToml.ts";
import { WorkspaceRepositoryContractError } from "../../../contracts/workspace-repository/contractValue.ts";
import { validateWorkspaceRepositorySyntax } from "../../../server/repository/workspaceRepositoryContentValidation.ts";

const firstId = "syntax-00000000-0000-4000-8000-000000000001";
const secondId = "syntax-00000000-0000-4000-8000-000000000002";
const validSource = formatSyntaxProfileToml(defaultCtnSyntaxProfile);

describe("server workspace repository content validation", () => {
  it("validates every file and returns only the active source", () => {
    const activeSource = formatSyntaxProfileToml({
      ...defaultCtnSyntaxProfile,
      name: "Secondary",
    });

    expect(validateWorkspaceRepositorySyntax({
      activeFileId: secondId,
      files: [
        { id: firstId, source: validSource },
        { id: secondId, source: activeSource },
      ],
    })).toEqual({ activeSource });
    expect(() => validateWorkspaceRepositorySyntax({
      activeFileId: secondId,
      files: [
        { id: firstId, source: 'name = "invalid inactive"\n' },
        { id: secondId, source: activeSource },
      ],
    })).toThrow(WorkspaceRepositoryContractError);
  });

  it("rejects profile names that collide after normalization", () => {
    const normalizedDuplicate = formatSyntaxProfileToml({
      ...defaultCtnSyntaxProfile,
      name: `  ${defaultCtnSyntaxProfile.name.normalize("NFKC").toLocaleUpperCase("en-US")}  `,
    });

    expect(() => validateWorkspaceRepositorySyntax({
      activeFileId: firstId,
      files: [
        { id: firstId, source: validSource },
        { id: secondId, source: normalizedDuplicate },
      ],
    })).toThrow("duplicate syntax profile name");
  });
});
