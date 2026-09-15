import { ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import type { ActivityRegionSlot } from "./activityTypes.ts";
import styles from "./RegionFrame.module.css";
import { Button } from "./shared/Button.tsx";
import { PageLayoutContext } from "./shared/PageLayout.ts";

export function RegionHeader({
  title,
  actions,
  position,
}: {
  title: ReactNode;
  actions?: ReactNode;
  position?: string;
}) {
  return (
    <header className={styles.header} data-region-header={position}>
      <h2
        className={styles.title}
        title={typeof title === "string" ? title : undefined}
      >
        {title}
      </h2>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function FocusAction({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle(): void;
}) {
  const label = active ? "退出专注模式" : "进入专注模式";
  const Icon = active ? Minimize2 : Maximize2;
  return (
    <Button
      aria-label={label}
      title={label}
      onClick={onToggle}
      variant="icon"
      type="button"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

/** One owner for all three region headings, boundaries and insets. */
export function RegionFrame({
  slot,
  position,
  onCollapse,
}: {
  slot: ActivityRegionSlot;
  position: "context" | "main" | "detail";
  onCollapse?(): void;
}) {
  return (
    <div
      className={styles.region}
      data-region={position}
      data-region-layout={slot.layout ?? "detail"}
    >
      <RegionHeader
        title={slot.title}
        position={position}
        actions={
          <>
            {slot.actions}
            {onCollapse ? (
              <Button
                aria-label={slot.collapseLabel ?? "收回右侧详情"}
                title={slot.collapseLabel ?? "收回右侧详情"}
                onClick={onCollapse}
                variant="icon"
                type="button"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            ) : null}
          </>
        }
      />
      {slot.toolbar ? (
        <div className={styles.toolbar}>{slot.toolbar}</div>
      ) : null}
      <PageLayoutContext value={slot.layout ?? "detail"}>
        <div className={styles.content}>{slot.content}</div>
      </PageLayoutContext>
      {slot.footer ? <div className={styles.footer}>{slot.footer}</div> : null}
    </div>
  );
}
