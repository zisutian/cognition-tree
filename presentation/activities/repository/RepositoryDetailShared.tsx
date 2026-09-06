import { Copy } from "lucide-react";
import type { RepositoryLocationRow } from
  "../../../application/repository/index.ts";
import {
  Button,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
} from "../../ui/index.ts";


export function RepositoryMetadata({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <ToolPropertyList aria-label="仓库状态">
      {rows.map((row) => (
        <ToolPropertyRow
          key={row.label}
          label={row.label}
          value={(
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
    </ToolPropertyList>
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
      <ToolPropertyList aria-label="仓库位置">
        {rows.map((row) => (
          <ToolPropertyRow
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
            key={row.label}
            label={row.label}
            value={(
              <span className="repository-location-path" title={row.value}>
                {row.value}
              </span>
            )}
          />
        ))}
      </ToolPropertyList>
    </ToolSection>
  );
}
