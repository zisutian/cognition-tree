// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { WireContractError } from "../../contracts/common/contractValue.ts";
import {
  parseBuiltInCatalog,
  parseBuiltInDescriptor,
  parseBuiltInRetryResult,
} from "../../contracts/built-ins/parseBuiltIns.ts";

const journal = {
  id: "journal" as const,
  label: "日记" as const,
  location: {
    serverPath: "/state/built-ins/journal/content.json",
    type: "server" as const,
  },
  protected: true as const,
};
const todoIssue = {
  code: "repository_corrupt" as const,
  id: "todo" as const,
  location: null,
  message: "fault",
  status: "fault" as const,
};

describe("built-in data wire contract", () => {
  it("covers Journal and Todo exactly once without content unions", () => {
    expect(parseBuiltInCatalog({
      issues: [todoIssue],
      repositories: [journal],
    })).toEqual({ issues: [todoIssue], repositories: [journal] });
    expect(parseBuiltInDescriptor(journal)).toEqual(journal);
    expect(parseBuiltInRetryResult({ status: "ready" })).toEqual({
      status: "ready",
    });
  });

  it("rejects missing, duplicate, mislabeled, or unprotected descriptors", () => {
    expect(() => parseBuiltInCatalog({
      issues: [],
      repositories: [journal],
    })).toThrow("cover journal and todo exactly once");
    expect(() => parseBuiltInCatalog({
      issues: [todoIssue, todoIssue],
      repositories: [journal],
    })).toThrow("cover journal and todo exactly once");
    expect(() => parseBuiltInDescriptor({ ...journal, label: "代办" }))
      .toThrow("label does not match id");
    expect(() => parseBuiltInDescriptor({ ...journal, protected: false }))
      .toThrow(WireContractError);
  });
});
