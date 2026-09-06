import type { CtnSyntaxDraft, CtnSyntaxDraftBuildResult } from "../../core/ctn/index.ts";
import type { Diagnostic } from "../problems/index.ts";
import { resolveSyntaxDiagnosticLocation, syntaxFieldIds, type SyntaxFieldId } from "./syntaxProjection.ts";

export type SyntaxDiagnosticTarget =
  | {
      fieldId: SyntaxFieldId;
      kind: "syntax-field";
      path: string;
      syntaxFileId: string;
    }
  | {
      fieldId: SyntaxFieldId;
      kind: "system-syntax";
      owner: "journal" | "todo";
      path: string;
    };
export type SyntaxDiagnostic = Diagnostic<SyntaxDiagnosticTarget>;

export function createUiSyntaxDiagnostics(
  draft: CtnSyntaxDraft,
  draftResult: CtnSyntaxDraftBuildResult,
  syntaxFileId: string,
  catalogNameConflictMessage = "",
): SyntaxDiagnostic[] {
  const schemaDiagnostics: SyntaxDiagnostic[] =
    draftResult.diagnostics.map((diagnostic) => {
      const location = resolveSyntaxDiagnosticLocation(
        draft,
        diagnostic.path,
      );
      const syntaxName = draft.name.trim() || "未命名语法";

      return {
        code: diagnostic.code,
        id: `syntax:${syntaxFileId}:${diagnostic.code}:${diagnostic.path}`,
        locationLabel: `${syntaxName} · ${location.label}`,
        message: diagnostic.message,
        severity: "error",
        source: "syntax",
        target: {
          fieldId: location.fieldId,
          kind: "syntax-field",
          path: diagnostic.path,
          syntaxFileId,
        },
      };
    });

  if (!catalogNameConflictMessage) {
    return schemaDiagnostics;
  }

  const syntaxName = draft.name.trim() || "未命名语法";
  const conflictDiagnostic: SyntaxDiagnostic = {
    code: "duplicate-syntax-name",
    id: `syntax:${syntaxFileId}:duplicate-syntax-name:$.name`,
    locationLabel: `${syntaxName} · 语法名称`,
    message: catalogNameConflictMessage,
    severity: "error",
    source: "syntax",
    target: {
      fieldId: syntaxFieldIds.name,
      kind: "syntax-field",
      path: "$.name",
      syntaxFileId,
    },
  };

  return [...schemaDiagnostics, conflictDiagnostic];
}

export function createUiSystemSyntaxDiagnostics(
  draft: CtnSyntaxDraft,
  draftResult: CtnSyntaxDraftBuildResult,
  owner: "journal" | "todo",
): SyntaxDiagnostic[] {
  const ownerLabel = owner === "journal" ? "日记" : "代办";

  return draftResult.diagnostics.map((diagnostic) => {
    const location = resolveSyntaxDiagnosticLocation(draft, diagnostic.path);

    return {
      code: diagnostic.code,
      id: `syntax:${owner}:${diagnostic.code}:${diagnostic.path}`,
      locationLabel: `${ownerLabel}语法 · ${location.label}`,
      message: diagnostic.message,
      severity: "error",
      source: "syntax",
      target: {
        fieldId: location.fieldId,
        kind: "system-syntax",
        owner,
        path: diagnostic.path,
      },
    };
  });
}
