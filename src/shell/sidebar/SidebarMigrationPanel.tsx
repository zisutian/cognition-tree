type SidebarMigrationPanelProps = {
  notesCount: number;
};

export function SidebarMigrationPanel({
  notesCount,
}: SidebarMigrationPanelProps) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">状态</p>
        <div className="side-metrics">
          <div className="side-metric">
            <span>笔记</span>
            <strong>{notesCount}</strong>
          </div>
          <div className="side-metric">
            <span>语法</span>
            <strong>1</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
