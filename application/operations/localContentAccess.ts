// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentOperationResult } from "./contentOperationPort.ts";

/** Read-only settings projection; content command submission belongs to ContentService. */
export type LocalContentAccess = {
  serviceOrigin: string;
  getOperation(operationId: string): Promise<ContentOperationResult>;
};
