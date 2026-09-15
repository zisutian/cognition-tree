// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { FormError, Page, PageBody } from "../../ui/index.ts";

export function SettingsPage({
  actions,
  children,
  errorMessage,
  label,
}: {
  actions?: ReactNode;
  children: ReactNode;
  errorMessage?: string | null;
  label: string;
}) {
  return (
    <Page actions={actions} aria-label={label}>
      <PageBody>
        <FormError message={errorMessage} />
        {children}
      </PageBody>
    </Page>
  );
}
