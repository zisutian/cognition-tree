// SPDX-License-Identifier: GPL-3.0-or-later

export type CancelScheduledTask = () => void;

export type ApplicationScheduler = {
  now(): number;
  schedule(
    callback: () => void,
    delayMs: number,
  ): CancelScheduledTask;
};
