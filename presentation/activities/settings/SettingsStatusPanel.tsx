// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { DetailPanel, ToolPanelBody } from "../../ui/index.ts";

export function SettingsStatusPanel({
  children,
  onCollapseDetail,
}: {
  children: ReactNode;
  onCollapseDetail(): void;
}) {
  return (
    <DetailPanel
      aria-label="设置状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">{children}</ToolPanelBody>
    </DetailPanel>
  );
}
