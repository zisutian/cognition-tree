// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { lstat } from "node:fs/promises";
import path from "node:path";
import type { ContentOperationResult } from "../../../application/operations/index.ts";
import { ContentOperationResultSchema } from "../../../contracts/content/index.ts";
import { parseApiSchema } from "../../../contracts/api/index.ts";
import {
  SecureJsonPartition,
  ensureSecureStateDirectory,
  secureStateDirectoryExists,
  assertStateFields,
  requireStateRecord,
  type SecureStateFileReplacer,
} from "../state/index.ts";

type ReceiptState = {
  formatVersion: 2;
  receipt: ContentOperationResult | null;
};

/** One independently locked durable file per operation; audit retention has no effect. */
export class ContentReceiptStore {
  private readonly directory: string;
  private readonly replaceFile: SecureStateFileReplacer | undefined;
  constructor(directory: string, replaceFile?: SecureStateFileReplacer) {
    this.directory = directory;
    this.replaceFile = replaceFile;
  }

  #location(operationId: string) {
    const key = createHash("sha256").update(operationId).digest("hex");
    return {
      directory: path.join(
        this.directory,
        "content-operations-v1",
        key.slice(0, 2),
      ),
      fileName: `${key}.json`,
    };
  }

  #partition(operationId: string) {
    return new SecureJsonPartition<ReceiptState>({
      ...this.#location(operationId),
      name: "content operation receipt",
      createInitial: () => ({ formatVersion: 2, receipt: null }),
      parse(value) {
        const state = requireStateRecord(value, "Content receipt");
        const legacy = state.formatVersion === undefined;
        assertStateFields(
          state,
          legacy ? ["receipt"] : ["formatVersion", "receipt"],
          "Content receipt",
        );
        if (!legacy && state.formatVersion !== 2)
          throw new Error("Unsupported content receipt format.");
        const receipt =
          state.receipt === null
            ? null
            : parseApiSchema(
                ContentOperationResultSchema,
                legacy
                  ? {
                      ...requireStateRecord(state.receipt, "Legacy receipt"),
                      preparation: null,
                    }
                  : state.receipt,
              );
        if (
          receipt &&
          (receipt.operationId !== operationId ||
            (receipt.status === "committed" &&
              !receipt.afterRevision &&
              !(
                receipt.scope.domain === "catalog" &&
                receipt.error?.code === "catalog_refresh_failed" &&
                receipt.preparation &&
                receipt.review
              )))
        )
          throw new Error("Content receipt identity or outcome is invalid.");
        return { formatVersion: 2, receipt };
      },
      ...(this.replaceFile ? { replaceFile: this.replaceFile } : {}),
    });
  }

  async read(operationId: string) {
    const location = this.#location(operationId);
    if (
      !(await secureStateDirectoryExists(
        path.join(this.directory, "content-operations-v1"),
      ))
    )
      return null;
    try {
      await lstat(path.join(location.directory, location.fileName));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    }
    return this.#partition(operationId).read(({ receipt }) => receipt);
  }

  async mutate<Result>(
    operationId: string,
    change: (state: ReceiptState) => { changed: boolean; result: Result },
  ) {
    await ensureSecureStateDirectory(
      path.join(this.directory, "content-operations-v1"),
    );
    return this.#partition(operationId).mutate(change);
  }

  async importLegacy(receipts: readonly ContentOperationResult[]) {
    for (const receipt of receipts) {
      await this.mutate(receipt.operationId, (state) => {
        if (state.receipt && !isDeepStrictEqual(state.receipt, receipt))
          throw new Error(
            "Legacy receipt migration conflicts with an existing receipt.",
          );
        const changed = state.receipt === null;
        state.receipt = receipt;
        return { changed, result: undefined };
      });
    }
  }
}
