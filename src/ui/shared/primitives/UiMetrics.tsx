import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

export type UiMetricItem = {
  label: ReactNode;
  value: ReactNode;
};

type UiMetricsProps = HTMLAttributes<HTMLDListElement> & {
  items: UiMetricItem[];
};

export function UiMetrics({ className, items, ...props }: UiMetricsProps) {
  return (
    <dl className={cx("ui-metrics", className)} {...props}>
      {items.map((item, index) => (
        <div className="ui-metric-row" key={index}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
