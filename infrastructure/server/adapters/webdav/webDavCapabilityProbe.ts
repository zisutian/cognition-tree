// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  WebDavCapabilityError,
  WebDavRequestError,
  type WebDavTransport,
} from "./webDavTransport.ts";

export async function probeWebDavCapabilities(transport: WebDavTransport) {
  const directory = `.ctn-capability-${randomUUID()}`;
  const resourcePath = `${directory}/probe.txt`;

  try {
    const creation = await transport.createCollection(directory);

    if (creation !== "created") {
      throw new WebDavCapabilityError("WebDAV server must support MKCOL");
    }
    const createdEtag = await transport.writeText(resourcePath, "one", {
      ifNoneMatch: "*",
    });

    if (!createdEtag) {
      throw new WebDavCapabilityError("WebDAV server must return ETag for PUT");
    }
    try {
      await transport.writeText(resourcePath, "must-not-overwrite", {
        ifNoneMatch: "*",
      });
      throw new WebDavCapabilityError("WebDAV server ignored If-None-Match");
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const resource = await transport.readText(resourcePath);

    if (!resource || resource.source !== "one" || !resource.etag) {
      throw new WebDavCapabilityError("WebDAV server must return ETag for GET");
    }
    const updatedEtag = await transport.writeText(resourcePath, "two", {
      ifMatch: resource.etag,
    });

    if (!updatedEtag || updatedEtag === resource.etag) {
      throw new WebDavCapabilityError(
        "WebDAV ETag must change after conditional PUT",
      );
    }
    try {
      await transport.writeText(resourcePath, "must-not-overwrite", {
        ifMatch: createdEtag,
      });
      throw new WebDavCapabilityError("WebDAV server ignored stale If-Match");
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const listed = await transport.listCollection(directory);

    if (
      !listed.some((entry) =>
        entry.path === resourcePath ||
        entry.path.endsWith(`/${resourcePath.split("/").at(-1) ?? ""}`)
      )
    ) {
      throw new WebDavCapabilityError(
        "WebDAV PROPFIND must list collection resources",
      );
    }
    try {
      await transport.remove(resourcePath, { ifMatch: createdEtag });
      throw new WebDavCapabilityError(
        "WebDAV server ignored stale DELETE If-Match",
      );
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const removed = await transport.remove(resourcePath, {
      ifMatch: updatedEtag,
    });

    if (!removed || await transport.readText(resourcePath)) {
      throw new WebDavCapabilityError(
        "WebDAV server ignored conditional DELETE",
      );
    }
  } catch (error) {
    if (error instanceof WebDavCapabilityError) throw error;
    throw new WebDavCapabilityError(
      "WebDAV server lacks required conditional request capabilities",
    );
  } finally {
    await transport.remove(directory).catch(() => false);
  }
}
