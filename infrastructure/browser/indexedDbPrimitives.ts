// SPDX-License-Identifier: GPL-3.0-or-later

export function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed"))
    );
  });
}

export function transactionComplete(transaction: IDBTransaction) {
  const completion = new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    );
  });

  // Observe the rejection immediately. Callers still await the same promise,
  // but an earlier request failure cannot surface as an unhandled rejection.
  void completion.catch(() => undefined);
  return completion;
}

export async function abortTransaction(
  transaction: IDBTransaction,
  completion: Promise<void>,
) {
  transaction.abort();
  await completion.catch(() => undefined);
}

export function openIndexedDatabase(
  indexedDb: IDBFactory,
  databaseName: string,
  version: number,
  upgrade: (
    database: IDBDatabase,
    oldVersion: number,
    transaction: IDBTransaction,
  ) => void,
) {
  const request = indexedDb.open(databaseName, version);

  request.addEventListener("upgradeneeded", (event) => {
    const transaction = request.transaction;

    if (!transaction) {
      throw new Error("IndexedDB upgrade transaction is unavailable");
    }
    upgrade(
      request.result,
      (event as IDBVersionChangeEvent).oldVersion,
      transaction,
    );
  });
  return requestResult(request);
}
