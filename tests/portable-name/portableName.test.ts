// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createPortableNameKey,
  getPortableNameIssue,
  normalizePortableName,
  parsePortableName,
  PortableNameValidationError,
} from "../../portable-name/portableName";

describe("portable names", () => {
  it("stores trimmed NFC names with collapsed ASCII spaces", () => {
    expect(normalizePortableName("  Cafe\u0301   笔记  ")).toBe("Café 笔记");
    expect(parsePortableName("  Cafe\u0301   笔记  ")).toBe("Café 笔记");
  });

  it("allows Unicode letters, marks and numbers plus safe separators", () => {
    expect(parsePortableName("研究 Notes_2026-甲")).toBe("研究 Notes_2026-甲");
    expect(getPortableNameIssue("研究 Notes_2026-甲")).toBeNull();
  });

  it("rejects empty names and non-portable punctuation or whitespace", () => {
    expect(() => parsePortableName("   ")).toThrow(PortableNameValidationError);
    expect(() => parsePortableName("仓库:笔记")).toThrow(
      /unsupported characters/,
    );
    expect(() => parsePortableName("two\ttabs")).toThrow(
      /unsupported characters/,
    );
    expect(getPortableNameIssue(" two  spaces ")).toBe("noncanonical");
    expect(getPortableNameIssue("bad/name")).toBe("unsupported-character");
  });

  it("uses NFKC and en-US lowercase for stable comparison keys", () => {
    expect(createPortableNameKey("  ＲＥＭＯＴＥ  ")).toBe("remote");
    expect(createPortableNameKey("İSTANBUL")).toBe("i̇stanbul");
  });
});
