// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";

import type { SettingsTarget } from "./settingsTypes.ts";
import type { ApiAccessSettingsStatusView } from "./useApiAccessSettingsSession.ts";

export function ApiAccessSettingsStatus({
  selection,
  session,
}: {
  selection: Extract<SettingsTarget, { kind: "automation" | "trusted" }>;
  session: ApiAccessSettingsStatusView;
}) {
  const snapshot = session.snapshot;
  const automationToken =
    selection.kind === "automation"
      ? (snapshot.tokens.find(({ id }) => id === selection.id) ?? null)
      : null;
  const trustedToken =
    selection.kind === "trusted"
      ? (snapshot.trustedClientTokens.find(({ id }) => id === selection.id) ??
        null)
      : null;
  const token = automationToken ?? trustedToken;

  return (
    <ToolSectionStack>
      {token ? (
        <ToolSection title={token.name}>
          <ToolPropertyList aria-label={`${token.name} 状态`}>
            <ToolPropertyRow
              label="前缀"
              value={<code>{token.prefix}…</code>}
            />
            <ToolPropertyRow
              label="创建时间"
              value={new Date(token.createdAt).toLocaleString()}
            />
            <ToolPropertyRow
              label="最近使用"
              value={
                token.lastUsedAt
                  ? new Date(token.lastUsedAt).toLocaleString()
                  : "从未使用"
              }
            />
          </ToolPropertyList>
        </ToolSection>
      ) : (
        <ToolSection title="API 访问">
          <ToolPropertyList aria-label="API 访问状态">
            <ToolPropertyRow
              label="状态"
              value={
                snapshot.loading
                  ? "载入中"
                  : snapshot.errorMessage
                    ? "故障"
                    : "就绪"
              }
            />
            <ToolPropertyRow
              label="自动化令牌"
              value={snapshot.tokens.length}
            />
            <ToolPropertyRow
              label="可信客户端"
              value={snapshot.trustedClientTokens.length}
            />
            {snapshot.errorMessage ? (
              <ToolPropertyRow label="错误" value={snapshot.errorMessage} />
            ) : null}
          </ToolPropertyList>
        </ToolSection>
      )}
    </ToolSectionStack>
  );
}
