// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "compact-ui";

import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ActivitySlots } from "../../ui/index.ts";

import { AgentSettingsStatus } from "./AgentSettingsStatus.tsx";
import { OperationsSettingsStatus } from "./OperationsSettingsStatus.tsx";
import { SettingsContext } from "./SettingsContext.tsx";
import { SettingsPanel, type SettingsPanelProps } from "./SettingsPanel.tsx";
import { SettingsStatusPanel } from "./SettingsStatusPanel.tsx";
import { SystemSettingsStatus } from "./SystemSettingsStatus.tsx";
import {
  settingsPageLabels,
  settingsTargetKey,
  type SettingsTarget,
} from "./settingsTypes.ts";

export function createSettingsActivitySlots(
  props: SettingsPanelProps & {
    blocked: boolean;
    onRefresh(): void;
    onSelect(target: SettingsTarget, intent?: "preview" | "pinned"): void;
  },
): ActivitySlots {
  const { agent, blocked, onRefresh, onSelect, operations, system, target } =
    props;
  const title =
    target.kind === "provider" || target.kind === "profile"
      ? ((target.kind === "provider"
          ? agent.configurationState.configuration?.providers
          : agent.configurationState.configuration?.profiles
        )?.find((item) => item.id === target.id)?.label ??
        (target.id
          ? `${settingsPageLabels[target.kind]} 已移除`
          : `新建 ${settingsPageLabels[target.kind]}`))
      : settingsPageLabels[target.kind];
  let detail: ReactNode = null;
  switch (target.kind) {
    case "network":
    case "paths":
    case "owner":
    case "migration":
    case "audit-retention":
      if (system.configurationState.configuration)
        detail = (
          <SystemSettingsStatus
            page={target.kind}
            state={system.configurationState}
          />
        );
      break;
    case "provider":
    case "profile":
      if (
        target.id &&
        (target.kind === "provider"
          ? agent.configurationState.configuration?.providers
          : agent.configurationState.configuration?.profiles
        )?.some((item) => item.id === target.id)
      )
        detail = (
          <AgentSettingsStatus
            state={agent.configurationState}
            target={target}
          />
        );
      break;
    case "audit":
      detail = <OperationsSettingsStatus session={operations} />;
      break;
  }
  return {
    context: {
      actions: (
        <Button
          aria-label="刷新设置状态"
          onClick={onRefresh}
          title="刷新设置状态"
          type="button"
          iconOnly
        >
          <RefreshCw aria-hidden="true" size={16} />
        </Button>
      ),
      content: (
        <SettingsContext
          agent={agent.configurationState}
          blocked={blocked}
          onSelect={onSelect}
          target={target}
        />
      ),
      title: "设置",
    },
    main: {
      fixedPageActions: [
        "provider",
        "profile",
        "network",
        "paths",
        "audit-retention",
      ].includes(target.kind),
      title,
      layout: "form",
      content: <SettingsPanel {...props} key={settingsTargetKey(target)} />,
    },
    detail: detail
      ? {
          title: "状态",
          layout: "detail",
          content: <SettingsStatusPanel>{detail}</SettingsStatusPanel>,
        }
      : null,
  };
}
