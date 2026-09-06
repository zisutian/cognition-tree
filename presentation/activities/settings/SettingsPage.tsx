// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { FormError, ToolPanel, ToolPanelBody } from "../../ui/index.ts";

export function SettingsPage({
  actions,
  children,
  errorMessage,
  label,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  errorMessage?: string | null;
  label?: string;
  title: string;
}) {
  return (
    <ToolPanel
      actions={actions}
      aria-label={label ?? title}
      className="settings-panel"
      title={title}
    >
      <ToolPanelBody layout="form">
        <FormError message={errorMessage} />
        {children}
      </ToolPanelBody>
    </ToolPanel>
  );
}
