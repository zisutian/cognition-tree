// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createWebDavResourceUrl,
  decodeWebDavCollectionHref,
  normalizeWebDavBaseUrl,
} from "../../../../../infrastructure/server/adapters/webdav/webDavPathCodec.ts";

describe("WebDAV path and URL codec", () => {
  it("normalizes only credential-free HTTP repository base URLs", () => {
    expect(normalizeWebDavBaseUrl("https://dav.example.test/root").toString())
      .toBe("https://dav.example.test/root/");
    expect(() => normalizeWebDavBaseUrl("ftp://dav.example.test/root"))
      .toThrow("Unsupported WebDAV protocol");
    expect(() =>
      normalizeWebDavBaseUrl("https://alice:secret@dav.example.test/root")
    ).toThrow("must not be embedded");
    expect(() =>
      normalizeWebDavBaseUrl("https://dav.example.test/root?token=secret")
    ).toThrow("query or fragment");
  });

  it("encodes repository-relative segments and rejects traversal", () => {
    const baseUrl = normalizeWebDavBaseUrl(
      "https://dav.example.test/root",
    );

    expect(createWebDavResourceUrl(baseUrl, "notes/one file.ctn").toString())
      .toBe("https://dav.example.test/root/notes/one%20file.ctn");
    expect(createWebDavResourceUrl(baseUrl, "", true)).toEqual(baseUrl);
    expect(() => createWebDavResourceUrl(baseUrl, "notes/../secret"))
      .toThrow("Invalid WebDAV repository path");
  });

  it("decodes only collection hrefs inside the configured base", () => {
    const baseUrl = normalizeWebDavBaseUrl(
      "https://dav.example.test/root",
    );

    expect(decodeWebDavCollectionHref(
      baseUrl,
      "/root/notes/one%20file.ctn",
    )).toBe("notes/one file.ctn");
    expect(decodeWebDavCollectionHref(
      baseUrl,
      "https://attacker.example.test/root/notes.ctn",
    )).toBeNull();
    expect(decodeWebDavCollectionHref(
      baseUrl,
      "/outside/notes.ctn",
    )).toBeNull();
  });
});
