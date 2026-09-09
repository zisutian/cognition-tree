// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createPortableNameKey,
  parsePortableName,
} from "../../core/naming/index.ts";

export type NamedContentResource = {
  id: string;
  kind: "repository" | "folder" | "note" | "entry" | "collection";
  name: string;
  path: string;
};

export class ContentTargetError extends Error {
  readonly code: "target_not_found" | "target_ambiguous";
  readonly selector: string;
  readonly candidates: string[];
  constructor(
    code: ContentTargetError["code"],
    selector: string,
    candidates: string[] = [],
  ) {
    super(
      code === "target_not_found"
        ? `No exact target matches: ${selector}`
        : `Target is ambiguous: ${selector}. Use a candidate relative path.`,
    );
    this.name = "ContentTargetError";
    this.code = code;
    this.selector = selector;
    this.candidates = candidates;
  }
}

export function resolveNamedContent<T extends { name: string; path: string }>(
  resources: readonly T[],
  selector: string,
): T {
  const explicitPath = selector.startsWith("./");
  const parts = (explicitPath ? selector.slice(2) : selector)
    .split("/")
    .map((part) => parsePortableName(part, "Target name"));
  const key = parts.map(createPortableNameKey).join("/");
  const matches = resources.filter(
    (resource) =>
      (parts.length === 1 && !explicitPath
        ? createPortableNameKey(resource.name)
        : resource.path.split("/").map(createPortableNameKey).join("/")) ===
      key,
  );
  if (matches.length === 0)
    throw new ContentTargetError("target_not_found", selector);
  if (matches.length > 1)
    throw new ContentTargetError(
      "target_ambiguous",
      selector,
      matches.map(({ path }) => (path.includes("/") ? path : `./${path}`)),
    );
  return matches[0]!;
}
