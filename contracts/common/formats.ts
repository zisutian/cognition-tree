// SPDX-License-Identifier: GPL-3.0-or-later

import { FormatRegistry } from "@sinclair/typebox";

function isCanonicalTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
}

function isLocalDate(value: string) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);

  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 &&
    year <= 9999 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

if (!FormatRegistry.Has("ctn-canonical-timestamp")) {
  FormatRegistry.Set("ctn-canonical-timestamp", isCanonicalTimestamp);
}
if (!FormatRegistry.Has("ctn-local-date")) {
  FormatRegistry.Set("ctn-local-date", isLocalDate);
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set(
    "uuid",
    (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      return new URL(value).toString() === value;
    } catch {
      return false;
    }
  });
}
