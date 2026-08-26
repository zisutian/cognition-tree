import { Copy } from "lucide-react";
import type { RepositoryLocationRow } from
  "../../../application/repository/repositoryViewTypes";
import { Button } from "../../ui/shared/primitives";
import {
  ToolList,
  ToolListRow,
  ToolSection,
} from "../../ui/shared/ToolSurface";

export function RepositoryMetadata({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <ToolList aria-label="仓库状态">
      {rows.map((row) => (
        <ToolListRow
          flow="wrap"
          key={row.label}
          leading={row.label}
          main={(
            <span
              className={row.label.endsWith("ID")
                ? "repository-identity-value"
                : undefined}
            >
              {row.value}
            </span>
          )}
        />
      ))}
    </ToolList>
  );
}

export function RepositoryLocations({
  busy,
  rows,
  onCopy,
}: {
  busy: boolean;
  rows: RepositoryLocationRow[];
  onCopy: (label: string, value: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <ToolSection title="位置">
      <ToolList aria-label="仓库位置">
        {rows.map((row) => (
          <ToolListRow
            actions={(
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
            )}
            flow="wrap"
            key={row.label}
            leading={row.label}
            main={(
              <span className="repository-location-path" title={row.value}>
                {row.value}
              </span>
            )}
          />
        ))}
      </ToolList>
    </ToolSection>
  );
}
