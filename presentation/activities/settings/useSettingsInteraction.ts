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
    ? "设置 · 正在提交，请稍候"
    : errorMessage
      ? `设置 · ${errorMessage}`
      : stale
        ? "设置已更新或对象已移除，请放弃修改并重新载入"
        : dirty
          ? "设置有未保存修改，请先在编辑区保存或放弃后再切换"
          : "";
  useLayoutEffect(() => {
    report({ navigationBlocked, statusMessage });
  }, [report, navigationBlocked, statusMessage]);
  useLayoutEffect(() => () => report(idleSettingsInteraction), [report]);
}
