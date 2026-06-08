type SidebarMigrationPanelProps = {
  notesCount: number;
  syntaxProfilesCount: number;
};

export function SidebarMigrationPanel({
  notesCount,
  syntaxProfilesCount,
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
            <strong>{syntaxProfilesCount}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
