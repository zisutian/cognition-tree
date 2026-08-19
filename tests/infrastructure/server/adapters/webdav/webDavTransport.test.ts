import { describe, expect, it } from "vitest";
import {
  createWebDavTransport,
  probeWebDavCapabilities,
  WebDavCapabilityError,
  type WebDavTransport,
} from "../../../../../infrastructure/server/adapters/webdav/webDavTransport.ts";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport";

describe("WebDAV HTTP transport", () => {
  it("sends credentials and conditional headers over HTTPS", async () => {
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
    expect(() => createWebDavTransport({
      password: "secret",
      url: "http://dav.example.test/root",
      username: "alice",
    })).toThrow("require HTTPS");
  });

  it("rejects URL credentials, query strings, and fragments", () => {
    expect(() => createWebDavTransport({
      url: "https://alice:secret@dav.example.test/root",
    })).toThrow("must not be embedded");
    expect(() => createWebDavTransport({
      url: "https://dav.example.test/root?token=secret",
    })).toThrow("query or fragment");
    expect(() => createWebDavTransport({
      url: "https://dav.example.test/root#redirect",
    })).toThrow("query or fragment");
  });

  it("never follows redirects or forwards authorization to their target", async () => {
    const requests: Array<{ authorization: string | null; redirect: RequestRedirect | undefined }> = [];
    const transport = createWebDavTransport({
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
    const transport = createWebDavTransport({
      fetch: async () => new Response("123456"),
      maxResponseBytes: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("oversized.txt")).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it("aborts every request at its fixed timeout", async () => {
    const transport = createWebDavTransport({
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
    const transport = createWebDavTransport({
      lookup: async () => new Promise(() => {}),
      requestTimeoutMs: 5,
      url: "https://dav.example.test/root",
    });

    await expect(transport.readText("resource.txt")).rejects.toMatchObject({
      statusCode: 408,
    });
  });

  it("keeps the timeout active while consuming a stalled response body", async () => {
    const transport = createWebDavTransport({
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

  it("probes conditional ETag, PROPFIND, MKCOL, GET, PUT, and DELETE support", async () => {
    await expect(probeWebDavCapabilities(new InMemoryWebDavTransport())).resolves.toBeUndefined();

    const memory = new InMemoryWebDavTransport();
    const noEtag: WebDavTransport = {
      createCollection: memory.createCollection.bind(memory),
      listCollection: memory.listCollection.bind(memory),
      readText: memory.readText.bind(memory),
      remove: memory.remove.bind(memory),
      async writeText(path, source, conditions) {
        await memory.writeText(path, source, conditions);
        return null;
      },
    };

    await expect(probeWebDavCapabilities(noEtag)).rejects.toBeInstanceOf(
      WebDavCapabilityError,
    );
  });

  it("rejects a server that acknowledges DELETE without removing the resource", async () => {
    const memory = new InMemoryWebDavTransport();
    const ignoresDelete: WebDavTransport = {
      createCollection: memory.createCollection.bind(memory),
      listCollection: memory.listCollection.bind(memory),
      readText: memory.readText.bind(memory),
      async remove() {
        return true;
      },
      writeText: memory.writeText.bind(memory),
    };

    await expect(probeWebDavCapabilities(ignoresDelete)).rejects.toBeInstanceOf(
      WebDavCapabilityError,
    );
  });

  it("rejects a server that does not actually support MKCOL", async () => {
    const memory = new InMemoryWebDavTransport();
    const noMkcol: WebDavTransport = {
      async createCollection() {
        return "already-exists";
      },
      listCollection: memory.listCollection.bind(memory),
      readText: memory.readText.bind(memory),
      remove: memory.remove.bind(memory),
      writeText: memory.writeText.bind(memory),
    };

    await expect(probeWebDavCapabilities(noMkcol)).rejects.toBeInstanceOf(
      WebDavCapabilityError,
    );
  });
});
