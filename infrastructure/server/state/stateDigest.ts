// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, timingSafeEqual } from "node:crypto";

export function createStateDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stateDigestsEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}
