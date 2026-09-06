// SPDX-License-Identifier: GPL-3.0-or-later

import "./settings.css";
import type { ReactNode } from "react";
import type { ActivitySlots } from "../../ui/index.ts";
import { AgentSettingsStatus } from "./AgentSettingsStatus.tsx";
import { ApiAccessSettingsStatus } from "./ApiAccessSettingsStatus.tsx";
import { OperationsSettingsStatus } from "./OperationsSettingsStatus.tsx";
import { SettingsContext } from "./SettingsContext.tsx";
import { SettingsPanel, type SettingsPanelProps } from "./SettingsPanel.tsx";
import { SettingsStatusPanel } from "./SettingsStatusPanel.tsx";
import { SystemSettingsStatus } from "./SystemSettingsStatus.tsx";
import { settingsTargetKey, type SettingsTarget } from "./settingsTypes.ts";

export function createSettingsActivitySlots(
  props: SettingsPanelProps & {
    blocked: boolean;
    onCollapseDetail(): void;
    onRefresh(): void;
    onSelect(target: SettingsTarget): void;
  },
): ActivitySlots {
  const {
    agent,
    api,
    blocked,
    onCollapseDetail,
    onRefresh,
    onSelect,
    operations,
    system,
    target,
  } = props;
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
    case "automation":
    case "trusted":
      if (
        target.id &&
        (target.kind === "automation"
          ? api.snapshot.tokens
          : api.snapshot.trustedClientTokens
        ).some((item) => item.id === target.id)
      )
        detail = <ApiAccessSettingsStatus selection={target} session={api} />;
      break;
    case "audit":
      detail = <OperationsSettingsStatus session={operations} />;
      break;
  }
  return {
    context: {
      content: (
        <SettingsContext
          agent={agent.configurationState}
          api={api.snapshot}
          blocked={blocked}
          onRefresh={onRefresh}
          onSelect={onSelect}
          target={target}
        />
      ),
      title: "设置",
    },
    main: <SettingsPanel {...props} key={settingsTargetKey(target)} />,
    detail: detail ? (
      <SettingsStatusPanel onCollapseDetail={onCollapseDetail}>
        {detail}
      </SettingsStatusPanel>
    ) : null,
  };
}
