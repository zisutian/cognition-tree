type ActivitySidebarPlaceholderProps = {
  entries: string[];
  label: string;
};

type ActivityMainPlaceholderProps = {
  description: string;
  label: string;
};

export function ActivitySidebarPlaceholder({
  entries,
  label,
}: ActivitySidebarPlaceholderProps) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-placeholder">
          <span>待接入</span>
          <strong>{label}</strong>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">入口</p>
        <div className="side-entry-list">
          {entries.map((entry) => (
            <button className="side-entry" disabled key={entry} type="button">
              {entry}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ActivityMainPlaceholder({
  description,
  label,
}: ActivityMainPlaceholderProps) {
  return (
    <section
      aria-label={`${label}待接入`}
      className="activity-main-panel migration-full-width activity-placeholder-panel"
    >
      <div className="activity-placeholder-empty">
        <h2>{label}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
