// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { RepositoryDescriptorDto } from "../../../../contracts/workspace/types";
import {
  parseAvailableWorkspaceRepositoryLabel,
  projectWorkspaceRepositoryLabelIssues,
} from "../../../../infrastructure/client/repository/repositoryLabelPolicy";

function descriptor(
  id: string,
  label: string,
): RepositoryDescriptorDto {
  return {
    adapter: "local",
    id,
    label,
    labelIssue: null,
    location: {
      hostPath: null,
      serverPath: `/repositories/${id}`,
      type: "local",
    },
  };
}

describe("repository label policy", () => {
  it("canonicalizes new labels and rejects reserved, duplicate, or unsafe names", () => {
    const repositories = [descriptor("primary", "Primary")];

    expect(parseAvailableWorkspaceRepositoryLabel(
      "  New   Notes  ",
      repositories,
    )).toBe("New Notes");
    expect(() => parseAvailableWorkspaceRepositoryLabel("ＰＲＩＭＡＲＹ", repositories))
      .toThrow(/already exists/);
    expect(() => parseAvailableWorkspaceRepositoryLabel("日记", repositories))
      .toThrow(/reserved/);
    expect(() => parseAvailableWorkspaceRepositoryLabel("bad:name", repositories))
      .toThrow(/portable repository label/);
  });

  it("keeps existing labels readable and projects a precise issue", () => {
    const repositories = [
      descriptor("first", "Same"),
      descriptor("second", "ＳＡＭＥ"),
      descriptor("reserved", "代办"),
      descriptor("unsafe", "bad/name"),
    ];
    const projected = projectWorkspaceRepositoryLabelIssues({
      creatableAdapters: ["local"],
      issues: [],
      repositories,
    });

    expect(projected.repositories.map(({ id, label, labelIssue }) => ({
      id,
      label,
      labelIssue,
    }))).toEqual([
      { id: "first", label: "Same", labelIssue: "conflict" },
      { id: "second", label: "ＳＡＭＥ", labelIssue: "conflict" },
      { id: "reserved", label: "代办", labelIssue: "reserved" },
      { id: "unsafe", label: "bad/name", labelIssue: "nonportable" },
    ]);
  });
});
