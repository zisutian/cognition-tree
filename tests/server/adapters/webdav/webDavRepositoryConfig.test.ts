import { describe, expect, it } from "vitest";
import { parseWebDavRepositoryConfigs } from "../../../../server/adapters/webdav/webDavRepositoryConfig.ts";

describe("WebDAV repository configuration", () => {
  it("parses named server-side repositories without exposing credentials in URLs", () => {
    expect(
      parseWebDavRepositoryConfigs(
        JSON.stringify([
          {
            id: "remote-notes",
            label: "远端笔记",
            password: "secret",
            url: "https://dav.example.test/notes",
            username: "alice",
          },
        ]),
      ),
    ).toEqual([
      {
        id: "remote-notes",
        label: "远端笔记",
        password: "secret",
        url: "https://dav.example.test/notes/",
        username: "alice",
      },
    ]);
  });

  it("rejects duplicate ids, partial credentials, and unsupported fields", () => {
    expect(() =>
      parseWebDavRepositoryConfigs(
        JSON.stringify([
          { id: "same", label: "A", url: "https://a.test" },
          { id: "same", label: "B", url: "https://b.test" },
        ]),
      ),
    ).toThrow("Duplicate WebDAV repository id");
    expect(() =>
      parseWebDavRepositoryConfigs(
        JSON.stringify([
          {
            id: "partial",
            label: "Partial",
            url: "https://dav.test",
            username: "alice",
          },
        ]),
      ),
    ).toThrow("credentials must be paired");
    expect(() =>
      parseWebDavRepositoryConfigs(
        JSON.stringify([
          {
            id: "extra",
            label: "Extra",
            token: "forbidden",
            url: "https://dav.test",
          },
        ]),
      ),
    ).toThrow("Unsupported");
    expect(() =>
      parseWebDavRepositoryConfigs(
        JSON.stringify([
          {
            id: "insecure",
            label: "Insecure",
            password: "secret",
            url: "http://dav.test",
            username: "alice",
          },
        ]),
      ),
    ).toThrow("requires HTTPS");
  });
});
