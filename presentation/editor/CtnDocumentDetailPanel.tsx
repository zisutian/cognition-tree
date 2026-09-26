import { PropertyList, PropertyRow, Stack } from "compact-ui";
import type { ReactNode } from "react";
import {
  Page,
  PageBody,
  StructureTree,
  type StructureTreeProps,
} from "../ui/index.ts";

type CtnTimestampMetadata = {
  createdAt: string;
  updatedAt: string;
};

type CtnDocumentStructure = Pick<
  StructureTreeProps,
  "ariaLabel" | "indentUnitCount" | "nodes" | "onSelectLine" | "selectedLineNumbers" | "stateKey"
>;

const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

function TimestampValue({
  label,
  timestamp,
}: {
  label: string;
  timestamp: string;
}) {
  return (
    <time
      aria-label={label}
      dateTime={timestamp}
      title={`${label}：${timestamp}`}
    >
      {formatTimestamp(timestamp)}
    </time>
  );
}

function TimestampRow({
  ariaLabel,
  label,
  metadata,
  updatedLabel,
}: {
  ariaLabel: string;
  label: string;
  metadata: CtnTimestampMetadata;
  updatedLabel: string;
}) {
  return (
    <section aria-label={ariaLabel}>
      <PropertyList>
        <PropertyRow label={`${label}创建`}>
          <TimestampValue
            label={`${label}创建时间`}
            timestamp={metadata.createdAt}
          />
        </PropertyRow>
        <PropertyRow label={`${label}${updatedLabel}`}>
          <TimestampValue
            label={`${label}${updatedLabel}时间`}
            timestamp={metadata.updatedAt}
          />
        </PropertyRow>
      </PropertyList>
    </section>
  );
}

function CtnTimeDetails({
  blockMetadata,
  documentLabel,
  documentMetadata,
}: {
  blockMetadata: CtnTimestampMetadata | null;
  documentLabel: string;
  documentMetadata: CtnTimestampMetadata;
}) {
  return (
    <section aria-label="时间信息">
      <Stack gap="tight">
        <TimestampRow
          ariaLabel={`${documentLabel}时间`}
          label={documentLabel}
          metadata={documentMetadata}
          updatedLabel="修改"
        />
        {blockMetadata ? (
          <TimestampRow
            ariaLabel="块时间"
            label="当前块"
            metadata={blockMetadata}
            updatedLabel="更新"
          />
        ) : null}
      </Stack>
    </section>
  );
}

export function CtnDocumentDetailPanel({
  blockMetadata,
  documentLabel,
  documentMetadata,
  stats,
  structure,
}: {
  blockMetadata: CtnTimestampMetadata | null;
  documentLabel: string;
  documentMetadata: CtnTimestampMetadata;
  stats: {
    lineCount: ReactNode;
    rootCount: ReactNode;
    totalBlocks: ReactNode;
  };
  structure: CtnDocumentStructure | null;
}) {
  return (
    <Page aria-label={`${documentLabel}详情`}>
      <PageBody scroll>
        <section aria-label={`${documentLabel}统计`}>
          <PropertyList>
            <PropertyRow label="行">{stats.lineCount}</PropertyRow>
            <PropertyRow label="块">{stats.totalBlocks}</PropertyRow>
            <PropertyRow label="根">{stats.rootCount}</PropertyRow>
          </PropertyList>
        </section>
        <CtnTimeDetails
          blockMetadata={blockMetadata}
          documentLabel={documentLabel}
          documentMetadata={documentMetadata}
        />
        {structure && structure.nodes.length > 0 ? (
          <StructureTree {...structure} />
        ) : null}
      </PageBody>
    </Page>
  );
}
