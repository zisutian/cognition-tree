// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const documents = [
  "README.md",
  ...readdirSync(path.join(root, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`),
];
const packageScripts = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).scripts;

function anchors(text: string) {
  const result = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = match[1]!
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/ /g, "-");
    const count = occurrences.get(slug) ?? 0;
    result.add(count ? `${slug}-${count}` : slug);
    occurrences.set(slug, count + 1);
  }
  return result;
}

describe("documentation entry points", () => {
  it("resolves local files and heading anchors without freezing paragraphs", () => {
    const errors: string[] = [];
    for (const file of documents) {
      const text = readFileSync(path.join(root, file), "utf8");
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1]!.replace(/^<|>$/g, "");
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const [relative, fragment] = target.split("#");
        const destination = path.resolve(
          root,
          path.dirname(file),
          decodeURIComponent(relative || path.basename(file)),
        );
        if (!existsSync(destination)) errors.push(`${file}: missing ${target}`);
        else if (
          fragment &&
          destination.endsWith(".md") &&
          !anchors(readFileSync(destination, "utf8")).has(
            decodeURIComponent(fragment),
          )
        )
          errors.push(`${file}: missing anchor ${target}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it("references existing project scripts and executable entry files", () => {
    const errors: string[] = [];
    for (const file of documents) {
      const text = readFileSync(path.join(root, file), "utf8");
      for (const match of text.matchAll(/\bpnpm (?:run )?([a-z][\w:-]*)/g)) {
        const name = match[1]!;
        if (
          !["exec", "install"].includes(name) &&
          !Object.prototype.hasOwnProperty.call(packageScripts, name)
        )
          errors.push(`${file}: unknown script ${name}`);
      }
      for (const match of text.matchAll(
        /(?:^\s+|`)\.\/([\w.-]+)(?=\s|`|$)/gm,
      )) {
        if (!existsSync(path.join(root, match[1]!)))
          errors.push(`${file}: missing executable ${match[1]}`);
      }
    }
    expect(errors).toEqual([]);
  });
});
