import type {
  CtnDiagnostic,
  CtnDiagnosticCode,
  CtnDiagnosticSeverity,
} from "./types";

export function createDiagnostic(
  code: CtnDiagnosticCode,
  severity: CtnDiagnosticSeverity,
  lineNumber: number,
  column: number,
  message: string,
): CtnDiagnostic {
  return {
    id: `${lineNumber}-${column}-${code}`,
    code,
    severity,
    lineNumber,
    column,
    message,
  };
}
