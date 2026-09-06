// SPDX-License-Identifier: GPL-3.0-or-later

import { ApplicationWriteBarrier } from "../../../application/runtime/index.ts";
import { DataRootWriteScope } from "../platform/index.ts";

export function createServerDataRootWriteScope() {
  return new DataRootWriteScope(new ApplicationWriteBarrier());
}
