// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseWebDavCollectionMultistatus,
} from "../../../../../infrastructure/server/adapters/webdav/webDavMultistatusCodec.ts";
import {
  normalizeWebDavBaseUrl,
} from "../../../../../infrastructure/server/adapters/webdav/webDavPathCodec.ts";

describe("WebDAV multistatus codec", () => {
  it("projects in-base resources and ignores the collection root and foreign hrefs", () => {
    const baseUrl = normalizeWebDavBaseUrl(
      "https://dav.example.test/root",
    );
    const source = `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/root/</d:href></d:response>
        <d:response>
          <d:href>/root/notes/one%20file.ctn</d:href>
          <d:propstat><d:prop>
            <d:getlastmodified>Tue, 18 Aug 2026 03:00:00 GMT</d:getlastmodified>
          </d:prop></d:propstat>
        </d:response>
        <d:response>
          <d:href>https://attacker.example.test/root/foreign.ctn</d:href>
        </d:response>
      </d:multistatus>`;

    expect(parseWebDavCollectionMultistatus(source, baseUrl)).toEqual([{
      lastModified: Date.parse("Tue, 18 Aug 2026 03:00:00 GMT"),
      path: "notes/one file.ctn",
    }]);
  });

  it("uses null for missing or invalid last-modified values", () => {
    const baseUrl = normalizeWebDavBaseUrl(
      "https://dav.example.test/root",
    );
    const source = `<multistatus xmlns="DAV:">
      <response><href>/root/one.txt</href></response>
      <response>
        <href>/root/two.txt</href>
        <getlastmodified>not-a-date</getlastmodified>
      </response>
    </multistatus>`;

    expect(parseWebDavCollectionMultistatus(source, baseUrl)).toEqual([
      { lastModified: null, path: "one.txt" },
      { lastModified: null, path: "two.txt" },
    ]);
  });
});
