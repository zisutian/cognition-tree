// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoLocalDate } from "../../core/todo/recurrence/todoRecurrence";

export type ApplicationLocalCalendar = {
  subscribe(listener: () => void): () => void;
  today(): TodoLocalDate;
};
