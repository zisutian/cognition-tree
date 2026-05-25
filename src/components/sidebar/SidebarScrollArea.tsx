import type { ReactNode } from "react";

type SidebarScrollAreaProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

function joinClassNames(classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function SidebarScrollArea({
  children,
  className,
  contentClassName,
}: SidebarScrollAreaProps) {
  return (
    <div className={joinClassNames(["sidebar-scroll-area", className])}>
      <div className="sidebar-scroll-area-viewport">
        <div
          className={joinClassNames([
            "sidebar-scroll-area-content",
            contentClassName,
          ])}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
