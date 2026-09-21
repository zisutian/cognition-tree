import { renderToStaticMarkup as render } from "react-dom/server";
import type { ReactNode } from "react";
import { CompactProvider, Panel } from "compact-ui";
import {
  PageNavigationProvider,
  createPageNavigation,
} from "../../../presentation/navigation/index.ts";
import { PageLayoutContext } from "../../../presentation/ui/shared/PageLayout.ts";
import type { ActivityRegionSlot } from "../../../presentation/ui/activityTypes.ts";
export function renderToStaticMarkup(node: ReactNode) {
  return render(
    <CompactProvider>
      <PageNavigationProvider navigation={createPageNavigation("notes")}>
        {node}
      </PageNavigationProvider>
    </CompactProvider>,
  );
}
export function RegionFrame({
  slot,
}: {
  slot: ActivityRegionSlot;
  position?: string;
  onCollapse?: () => void;
}) {
  return (
    <Panel
      title={slot.title}
      actions={slot.actions}
      toolbar={slot.toolbar}
      footer={slot.footer}
      layout="fill"
    >
      <PageLayoutContext value={slot.layout ?? "detail"}>
        {slot.content}
      </PageLayoutContext>
    </Panel>
  );
}
