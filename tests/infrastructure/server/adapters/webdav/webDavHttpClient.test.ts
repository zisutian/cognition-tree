import { describe, expect, it } from "vitest";
import {
  createWebDavHttpClient,
} from "../../../../../infrastructure/server/adapters/webdav/webDavHttpClient.ts";

describe("WebDAV HTTP transport", () => {
  it("sends credentials and conditional headers over HTTPS", async () => {
    const requests: Array<{ headers: Headers; method: string; url: string }> = [];
    const transport = createWebDavHttpClient({
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

    await expect(transport.writeText(".ctn lock.json", "{}", { ifNoneMatch: "*" }))
      .resolves.toBe('"lock-1"');
    expect(requests[0]).toMatchObject({
      method: "PUT",
      url: "https://dav.example.test/root/.ctn%20lock.json",
    });
    expect(requests[0]?.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    );
    expect(requests[0]?.headers.get("if-none-match")).toBe("*");
  });

  it("requires HTTPS when credentials are configured", () => {
    expect(() => createWebDavHttpClient({
      password: "secret",
      url: "http://dav.example.test/root",
      username: "alice",
    })).toThrow("require HTTPS");
  });

  it("rejects URL credentials, query strings, and fragments", () => {
    expect(() => createWebDavHttpClient({
      url: "https://alice:secret@dav.example.test/root",
    })).toThrow("must not be embedded");
    expect(() => createWebDavHttpClient({
      url: "https://dav.example.test/root?token=secret",
    })).toThrow("query or fragment");
    expect(() => createWebDavHttpClient({
      url: "https://dav.example.test/root#redirect",
    })).toThrow("query or fragment");
  });

  it("never follows redirects or forwards authorization to their target", async () => {
    const requests: Array<{ authorization: string | null; redirect: RequestRedirect | undefined }> = [];
    const transport = createWebDavHttpClient({
      fetch: async (_input, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
          redirect: init?.redirect,
        });
        return new Response(null, {
          headers: { Location: "https://attacker.example.test/steal" },
          status: 302,
        });
      },
      password: "secret",
      url: "https://dav.example.test/root",
      username: "alice",
    });

    await expect(transport.readText("resource.txt")).rejects.toMatchObject({
      statusCode: 302,
    });
    expect(requests).toEqual([{
      authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
      redirect: "error",
    }]);
  });

  it("bounds response bodies even when Content-Length is absent", async () => {
    const transport = createWebDavHttpClient({
      fetch: async () => new Response("123456"),
      maxResponseBytes: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("oversized.txt")).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it("aborts every request at its fixed timeout", async () => {
    const transport = createWebDavHttpClient({
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
      requestTimeoutMs: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("resource.txt")).rejects.toMatchObject({
      statusCode: 408,
    });
  });

  it("applies the same deadline while DNS resolution is still pending", async () => {
    const transport = createWebDavHttpClient({
      lookup: async () => new Promise(() => {}),
      requestTimeoutMs: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("resource.txt")).rejects.toMatchObject({
      statusCode: 408,
    });
  });

  it("keeps the timeout active while consuming a stalled response body", async () => {
    const transport = createWebDavHttpClient({
      fetch: async (_input, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new Error("aborted"));
          });
        },
      })),
      requestTimeoutMs: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("stalled.txt")).rejects.toMatchObject({
      statusCode: 408,
    });
  });

  it("decodes PROPFIND multistatus responses through the collection codec", async () => {
    const transport = createWebDavHttpClient({
      fetch: async () => new Response(
        `<d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/root/notes/one%20file.ctn</d:href>
            <d:getlastmodified>Tue, 18 Aug 2026 03:00:00 GMT</d:getlastmodified>
          </d:response>
        </d:multistatus>`,
        { status: 207 },
      ),
      url: "https://dav.example.test/root",
    });

    await expect(transport.listCollection("notes")).resolves.toEqual([{
      lastModified: Date.parse("Tue, 18 Aug 2026 03:00:00 GMT"),
      path: "notes/one file.ctn",
    }]);
  });

});
