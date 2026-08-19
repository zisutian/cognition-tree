// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  probeWebDavCapabilities,
} from "../../../../../infrastructure/server/adapters/webdav/webDavCapabilityProbe.ts";
import {
  WebDavCapabilityError,
  type WebDavTransport,
} from "../../../../../infrastructure/server/adapters/webdav/webDavTransport.ts";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport";

describe("WebDAV capability probe", () => {
  it("probes conditional ETag, PROPFIND, MKCOL, GET, PUT, and DELETE support", async () => {
    await expect(probeWebDavCapabilities(new InMemoryWebDavTransport()))
      .resolves.toBeUndefined();

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
