// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoLocalDate } from "../../core/todo/recurrence/todoLocalDate";

export type TodoLocalCalendar = {
  subscribe(listener: () => void): () => void;
  today(): TodoLocalDate;
};
