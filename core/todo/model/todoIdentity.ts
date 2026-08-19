// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoCollectionId } from "./todoContent.ts";

const collectionIdPattern =
  /^todo-collection-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isTodoCollectionId(value: string): value is TodoCollectionId {
  return collectionIdPattern.test(value);
}
