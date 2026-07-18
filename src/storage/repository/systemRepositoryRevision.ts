// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeSystemRepositoryRevisionContent } from "../../../contracts/system-repository/revision";
import type {
  SystemRepositoryContent,
  SystemRepositoryRevision,
} from "./systemRepository";

export async function createSystemRepositoryRevision(
  content: SystemRepositoryContent,
): Promise<SystemRepositoryRevision> {
  const bytes = new TextEncoder().encode(
    serializeSystemRepositoryRevisionContent(content),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `sha256:${hex}`;
}
