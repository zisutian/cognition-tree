// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect } from "react";
import type { ActivityInteractionState } from "../../ui/index.ts";

export type SettingsInteractionReporter = (
  state: ActivityInteractionState,
) => void;
export const idleSettingsInteraction: ActivityInteractionState = {
  navigationBlocked: false,
  statusMessage: "",
};

export function useSettingsInteraction(
  report: SettingsInteractionReporter,
  {
    dirty = false,
    stale = false,
    submitting = false,
    errorMessage,
  }: {
    dirty?: boolean;
    stale?: boolean;
    submitting?: boolean;
    errorMessage?: string | null;
  },
) {
  const navigationBlocked = dirty || stale || submitting;
  const statusMessage = submitting
    ? "设置 · 正在提交"
    : errorMessage
      ? `设置 · ${errorMessage}`
      : stale
        ? "设置 · 配置已过期或对象已移除"
        : dirty
          ? "设置 · 未保存修改"
          : "";
  useLayoutEffect(() => {
    report({ navigationBlocked, statusMessage });
  }, [report, navigationBlocked, statusMessage]);
  useLayoutEffect(() => () => report(idleSettingsInteraction), [report]);
}
