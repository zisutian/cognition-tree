// SPDX-License-Identifier: GPL-3.0-or-later

export type WorkspaceSyntaxFile = {
  id: string;
  source: string;
};

export type WorkspaceSyntaxCatalog = {
  activeFileId: string | null;
  files: WorkspaceSyntaxFile[];
};

const workspaceSyntaxFileIdPattern =
  /^syntax-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isWorkspaceSyntaxFileId(value: string) {
  return workspaceSyntaxFileIdPattern.test(value);
}

export function normalizeWorkspaceSyntaxProfileName(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}
