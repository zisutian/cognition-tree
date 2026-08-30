// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "../../ui/shared/primitives";
import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type { ApiAccessSelection } from "./settingsTypes";
import type { ApiAccessSettingsStatusView } from "./useApiAccessSettingsSession";

export function ApiAccessSettingsStatus({ selection, session }: {
  selection: ApiAccessSelection;
  session: ApiAccessSettingsStatusView;
}) {
  const snapshot = session.snapshot;
  const automationToken = selection.kind === "automation"
    ? snapshot.tokens.find(({ id }) => id === selection.id) ?? null
    : null;
  const trustedToken = selection.kind === "trusted"
    ? snapshot.trustedClientTokens.find(({ id }) => id === selection.id) ?? null
    : null;
  const token = automationToken ?? trustedToken;

  return (
    <ToolSectionStack>
      {snapshot.secret ? (
        <ToolSection title="新令牌">
          <ToolPropertyList aria-label="新令牌">
            <ToolPropertyRow actions={<Button onClick={session.dismissSecret} type="button">关闭显示</Button>} label="密钥" value={<code>{snapshot.secret}</code>} />
          </ToolPropertyList>
        </ToolSection>
      ) : null}
      {token ? (
        <ToolSection title={token.name}>
          <ToolPropertyList aria-label={`${token.name} 状态`}>
            <ToolPropertyRow label="前缀" value={<code>{token.prefix}…</code>} />
            <ToolPropertyRow label="创建时间" value={new Date(token.createdAt).toLocaleString()} />
            <ToolPropertyRow label="最近使用" value={token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "从未使用"} />
            {automationToken ? (
              <>
                <ToolPropertyRow label="权限" value={automationToken.scopes.join("、")} />
                <ToolPropertyRow label="仓库" value={automationToken.repositoryIds?.join("、") || "全部仓库"} />
              </>
            ) : <ToolPropertyRow label="权限" value="完整同步" />}
          </ToolPropertyList>
        </ToolSection>
      ) : (
        <ToolSection title="API 访问">
          <ToolPropertyList aria-label="API 访问状态">
            <ToolPropertyRow label="状态" value={snapshot.loading ? "载入中" : snapshot.errorMessage ? "故障" : "就绪"} />
            <ToolPropertyRow label="自动化令牌" value={snapshot.tokens.length} />
            <ToolPropertyRow label="可信客户端" value={snapshot.trustedClientTokens.length} />
            {snapshot.errorMessage ? <ToolPropertyRow label="错误" value={snapshot.errorMessage} /> : null}
          </ToolPropertyList>
        </ToolSection>
      )}
    </ToolSectionStack>
  );
}
