// SPDX-License-Identifier: GPL-3.0-or-later

export function normalizeWebDavBaseUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported WebDAV protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("WebDAV credentials must not be embedded in the URL");
  }
  if (url.search || url.hash) {
    throw new Error("WebDAV repository URL must not contain query or fragment");
  }

  url.pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  return url;
}

function encodeRelativePath(relativePath: string, allowRoot = false) {
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (allowRoot) return "";
    throw new Error(`Invalid WebDAV repository path: ${relativePath}`);
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid WebDAV repository path: ${relativePath}`);
  }
  return segments.map(encodeURIComponent).join("/");
}

export function createWebDavResourceUrl(
  baseUrl: URL,
  relativePath: string,
  allowRoot = false,
) {
  return new URL(encodeRelativePath(relativePath, allowRoot), baseUrl);
}

export function decodeWebDavCollectionHref(baseUrl: URL, href: string) {
  let url: URL;

  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (
    url.origin !== baseUrl.origin ||
    !url.pathname.startsWith(baseUrl.pathname)
  ) {
    return null;
  }
  return decodeURIComponent(url.pathname.slice(baseUrl.pathname.length))
    .replace(/\/$/, "");
}
