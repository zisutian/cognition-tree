import type {
  BuiltInId,
  RepositorySelection,
  RepositoryViewModel,
} from "../../../application/repository/repositoryViewModel";

export const builtInIds = [
  "journal",
  "todo",
] as const satisfies readonly BuiltInId[];

export function builtInLabel(id: BuiltInId) {
  return id === "journal" ? "日记" : "代办";
}

export function selectedRepositoryTarget(
  selection: RepositorySelection,
  view: RepositoryViewModel,
) {
  switch (selection.kind) {
    case "create":
      return { kind: selection.kind } as const;
    case "ordinary-issue":
      return {
        issue: view.issues.find(({ id }) => id === selection.id) ?? null,
        kind: selection.kind,
      } as const;
    case "ordinary-repository":
      return {
        kind: selection.kind,
        repository: view.repositories.find(({ id }) => id === selection.id) ??
          null,
      } as const;
    case "built-in":
      return {
        id: selection.id,
        issue: view.builtInIssues.find(({ id }) => id === selection.id) ?? null,
        kind: selection.kind,
        repository: view.builtIns.find(({ id }) => id === selection.id) ??
          null,
      } as const;
  }
}

export async function copyRepositoryLocation(
  value: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined =
    globalThis.navigator?.clipboard,
) {
  if (!clipboard) {
    throw new Error("当前环境不支持复制到剪贴板。");
  }
  await clipboard.writeText(value);
}
