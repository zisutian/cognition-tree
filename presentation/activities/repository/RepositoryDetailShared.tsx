import {
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import { Button, Section } from "compact-ui";
import { Copy } from "lucide-react";
import type { RepositoryLocationRow } from "../../../application/repository/index.ts";
import { createClassNames } from "../../ui/index.ts";
import repositoryStyles from "./repository.module.css";
const cx = createClassNames(repositoryStyles);

export function RepositoryMetadata({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <section aria-label="仓库状态">
      <ToolPropertyList>
        {rows.map((row) => (
          <ToolPropertyRow
            key={row.label}
            label={row.label}
            children={
              <span
                className={cx(
                  row.label.endsWith("ID")
                    ? "repository-identity-value"
                    : undefined,
                )}
              >
                {row.value}
              </span>
            }
          />
        ))}
      </ToolPropertyList>
    </section>
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
    <Section title="位置">
      <section aria-label="仓库位置">
        <ToolPropertyList>
          {rows.map((row) => (
            <ToolPropertyRow
              action={
                <Button
                  aria-label={`复制${row.label}`}
                  disabled={busy}
                  onClick={() => onCopy(row.label, row.copyValue)}
                  title={`复制${row.label}`}
                  type="button"
                  iconOnly
                >
                  <Copy aria-hidden="true" size={13} />
                </Button>
              }
              key={row.label}
              label={row.label}
              children={
                <span
                  className={cx("repository-location-path")}
                  title={row.value}
                >
                  {row.value}
                </span>
              }
            />
          ))}
        </ToolPropertyList>
      </section>
    </Section>
  );
}
