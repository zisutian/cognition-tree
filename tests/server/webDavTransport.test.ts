import { describe, expect, it } from "vitest";
import { createWebDavTransport } from "../../server/webDavTransport.ts";

describe("WebDAV HTTP transport", () => {
  it("sends server-side credentials and conditional WebDAV headers", async () => {
    const requests: Array<{ headers: Headers; method: string; url: string }> = [];
    const transport = createWebDavTransport({
      fetch: async (input, init) => {
        requests.push({
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: String(input),
        });
        return new Response(null, { headers: { ETag: '"lock-1"' }, status: 201 });
      },
      password: "secret",
      url: "https://dav.example.test/root",
      username: "alice",
    });

    await expect(
      transport.writeText(".ctn lock.json", "{}", { ifNoneMatch: "*" }),
    ).resolves.toBe('"lock-1"');
    expect(requests[0]).toMatchObject({
      method: "PUT",
      url: "https://dav.example.test/root/.ctn%20lock.json",
    });
    expect(requests[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    );
    expect(requests[0].headers.get("if-none-match")).toBe("*");
  });

  it("treats missing resources as absent and rejects embedded credentials", async () => {
    const transport = createWebDavTransport({
      fetch: async () => new Response(null, { status: 404 }),
      url: "https://dav.example.test/root/",
    });

    await expect(transport.readText("workspace.json")).resolves.toBeNull();
    expect(() =>
      createWebDavTransport({ url: "https://user:secret@dav.example.test/root" }),
    ).toThrow("must not be embedded");
  });
});
