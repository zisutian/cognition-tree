// SPDX-License-Identifier: GPL-3.0-or-later

export async function createVersionedContentRevision(
  serializedContent: string,
): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(serializedContent);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `sha256:${hex}`;
}
