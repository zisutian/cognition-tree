import { Copy } from "lucide-react";
import type { RepositoryOption } from "../../../application/repository/repositoryViewModel";
import { Button, Section } from "../../ui/shared/primitives";

export function RepositoryMetadata({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="repository-summary-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd
            className={row.label.endsWith("ID")
              ? "repository-identity-value"
              : undefined}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RepositoryLocations({
  busy,
  rows,
  onCopy,
}: {
  busy: boolean;
  rows: RepositoryOption["locationRows"];
  onCopy: (label: string, value: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <Section className="repository-section" title="位置">
      <div className="repository-location-list">
        {rows.map((row) => (
          <div className="repository-location-row" key={row.label}>
            <span className="repository-row-label">{row.label}</span>
            <div className="repository-location-value">
              <span title={row.value}>{row.value}</span>
              <Button
                aria-label={`复制${row.label}`}
                disabled={busy}
                onClick={() => onCopy(row.label, row.copyValue)}
                title={`复制${row.label}`}
                type="button"
                variant="icon"
              >
                <Copy aria-hidden="true" size={13} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
