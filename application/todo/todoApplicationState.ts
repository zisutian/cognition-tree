// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "./todoViewModel";

export type TodoApplication =
  | { reload: () => Promise<void>; status: "unavailable" }
  | { status: "loading" }
  | { errorMessage: string; reload: () => Promise<void>; status: "failed" }
  | { reload: () => Promise<void>; status: "ready"; view: TodoViewModel };
