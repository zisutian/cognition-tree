import { describe, expect, it } from "vitest";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax.ts";
import { formatCtnSyntaxV2 } from "../../../../../core/ctn/syntax/formatter.ts";
import { WorkspaceRepositoryContractError } from "../../../../../contracts/workspace/contractValue.ts";
import { validateWorkspaceRepositorySyntax } from "../../../../../infrastructure/server/repository/workspace/contentValidation.ts";

const firstId = "syntax-00000000-0000-4000-8000-000000000001";
const secondId = "syntax-00000000-0000-4000-8000-000000000002";
const validSource = formatCtnSyntaxV2(
  defaultCtnSyntax.definition,
  "workspace",
);

describe("server workspace repository content validation", () => {
  it("validates every file and returns only the active source", () => {
    const activeSource = formatCtnSyntaxV2({
      ...defaultCtnSyntax.definition,
      name: "Secondary",
    }, "workspace");

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

  it("rejects syntax names that collide after normalization", () => {
    const normalizedDuplicate = formatCtnSyntaxV2({
      ...defaultCtnSyntax.definition,
      name: `  ${defaultCtnSyntax.name.normalize("NFKC").toLocaleUpperCase("en-US")}  `,
    }, "workspace");

    expect(() => validateWorkspaceRepositorySyntax({
      activeFileId: firstId,
      files: [
        { id: firstId, source: validSource },
        { id: secondId, source: normalizedDuplicate },
      ],
    })).toThrow("duplicate syntax name");
  });
});
