// SPDX-License-Identifier: GPL-3.0-or-later

export { formatSyntaxProfileToml } from "./profileTomlFormatter.ts";
export { parseSyntaxProfileToml } from "./profileTomlParser.ts";
export type {
  ParseSyntaxProfileTomlResult,
  SyntaxProfileTomlDiagnostic,
  SyntaxProfileTomlDiagnosticCode,
} from "./profileTomlParser.ts";
