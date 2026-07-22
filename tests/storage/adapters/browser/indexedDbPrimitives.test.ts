// SPDX-License-Identifier: GPL-3.0-or-later

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  abortTransaction,
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from "../../../../infrastructure/browser/indexedDbPrimitives";

describe("IndexedDB primitives", () => {
  it("runs upgrades once and resolves request and transaction results", async () => {
    const indexedDb = new IDBFactory();
    const upgrade = vi.fn((database: IDBDatabase) => {
      database.createObjectStore("values");
    });
    const database = await openIndexedDatabase(
      indexedDb,
      "primitive-test",
      1,
      upgrade,
    );
    const write = database.transaction("values", "readwrite");
    const writeCompletion = transactionComplete(write);

    write.objectStore("values").put("stored", "key");
    await writeCompletion;
    const read = database.transaction("values", "readonly");
    const readCompletion = transactionComplete(read);

    await expect(requestResult(read.objectStore("values").get("key")))
      .resolves.toBe("stored");
    await readCompletion;
    database.close();
    const reopened = await openIndexedDatabase(
      indexedDb,
      "primitive-test",
      1,
      upgrade,
    );

    expect(upgrade).toHaveBeenCalledTimes(1);
    reopened.close();
  });

  it("observes an intentional transaction abort", async () => {
    const indexedDb = new IDBFactory();
    const database = await openIndexedDatabase(
      indexedDb,
      "abort-test",
      1,
      (opened) => opened.createObjectStore("values"),
    );
    const transaction = database.transaction("values", "readwrite");
    const completion = transactionComplete(transaction);

    transaction.objectStore("values").put("discarded", "key");
    await expect(abortTransaction(transaction, completion)).resolves
      .toBeUndefined();
    const read = database.transaction("values", "readonly");
    const readCompletion = transactionComplete(read);

    await expect(requestResult(read.objectStore("values").get("key")))
      .resolves.toBeUndefined();
    await readCompletion;
    database.close();
  });
});
