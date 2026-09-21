// SPDX-License-Identifier: GPL-3.0-or-later

import { FormLayout } from "compact-ui";
import { useLayoutEffect, useRef, type ComponentProps } from "react";

/** Connect a region footer's native submit button to the package-owned form.
 * Compact UI 0.1.0 does not expose a form id/ref. Only the standard DOM form
 * association is adapted here; layout, submission and validation stay native.
 */
export function AssociatedForm({
  id,
  ...props
}: ComponentProps<typeof FormLayout> & { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const form = host.current?.querySelector("form");
    if (!form) return;
    form.id = id;
    return () => form.removeAttribute("id");
  }, [id]);
  return (
    <div ref={host}>
      <FormLayout {...props} />
    </div>
  );
}
