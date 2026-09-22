// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { Page, PageBody } from "../../ui/index.ts";

export function SettingsPage({
  actions,
  children,
  label,
}: {
  actions?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <Page actions={actions} aria-label={label}>
      <PageBody>{children}</PageBody>
    </Page>
  );
}
