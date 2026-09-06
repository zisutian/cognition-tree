// SPDX-License-Identifier: GPL-3.0-or-later

import { FormatRegistry, Type } from "@sinclair/typebox";
import { expect, it } from "vitest";
import { inspectWireSchema } from "../../contracts/common/schemaValidation.ts";

it("initializes formats at decoding time without import-order dependencies", async () => {
  const before = [...FormatRegistry.Entries()];
  await import("../../contracts/agent/schemas.ts");
  await import("../../contracts/api/schemas/foundation.ts");
  expect([...FormatRegistry.Entries()]).toEqual(before);

  const date = Type.String({ format: "ctn-local-date" });
  expect(inspectWireSchema(date, "2024-02-29")).toBeNull();
  expect(inspectWireSchema(date, "2025-02-29")).not.toBeNull();
  const timestamp = Type.String({ format: "ctn-canonical-timestamp" });
  expect(inspectWireSchema(timestamp, "2026-09-06T00:00:00.000Z")).toBeNull();
  expect(inspectWireSchema(timestamp, "2026-09-06T00:00:00Z")).not.toBeNull();
  expect(inspectWireSchema(date, "2024-02-29")).toBeNull();
});
