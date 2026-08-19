// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, timingSafeEqual } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";

export function createApiV1StateDigest(source: string) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function createApiV1CommandRequestDigest(value: unknown) {
  return createApiV1StateDigest(
    serializeJsonIteratively(value, { sortObjectKeys: true }),
  );
}

export function apiV1StateDigestsEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}
