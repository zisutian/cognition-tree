import { CalendarPlus, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import {
  DetailPanel,
  PanelBody,
  StructureTree,
  type StructureTreeProps,
} from "../ui/index.ts";

import "./CtnDocumentDetailPanel.css";

type CtnTimestampMetadata = {
  createdAt: string;
  updatedAt: string;
};

type CtnDocumentStructure = Pick<
  StructureTreeProps,
  | "indentUnitCount"
  | "nodes"
  | "onSelectLine"
  | "selectedLineNumbers"
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
  type,
}: {
  label: string;
  timestamp: string;
  type: "created" | "updated";
}) {
  const Icon = type === "created" ? CalendarPlus : Clock3;

  return (
    <time
      aria-label={label}
      className="ctn-document-time-value"
      dateTime={timestamp}
      title={`${label}：${timestamp}`}
    >
      <Icon aria-hidden="true" size={12} />
      <span>{formatTimestamp(timestamp)}</span>
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
    <div aria-label={ariaLabel} className="ctn-document-time-row">
      <span className="ctn-document-time-kind">{label}</span>
      <TimestampValue
        label={`${label}创建时间`}
        timestamp={metadata.createdAt}
        type="created"
      />
      <TimestampValue
        label={`${label}${updatedLabel}时间`}
        timestamp={metadata.updatedAt}
        type="updated"
      />
    </div>
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
    <div aria-label="时间信息" className="ctn-document-time-details">
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
    </div>
  );
}

export function CtnDocumentDetailPanel({
  blockMetadata,
  documentLabel,
  documentMetadata,
  onCollapseDetail,
  stats,
  structure,
}: {
  blockMetadata: CtnTimestampMetadata | null;
  documentLabel: string;
  documentMetadata: CtnTimestampMetadata;
  onCollapseDetail: () => void;
  stats: {
    lineCount: ReactNode;
    rootCount: ReactNode;
    totalBlocks: ReactNode;
  };
  structure: CtnDocumentStructure | null;
}) {
  return (
    <DetailPanel
      aria-label={`${documentLabel}详情`}
      onCollapse={onCollapseDetail}
      title="结构"
    >
      <PanelBody className="detail-panel-stack" scroll>
        <dl aria-label={`${documentLabel}统计`} className="detail-summary-strip">
          <div><dd>{stats.lineCount}</dd><dt>行</dt></div>
          <div><dd>{stats.totalBlocks}</dd><dt>块</dt></div>
          <div><dd>{stats.rootCount}</dd><dt>根</dt></div>
        </dl>
        <CtnTimeDetails
          blockMetadata={blockMetadata}
          documentLabel={documentLabel}
          documentMetadata={documentMetadata}
        />
        {structure && structure.nodes.length > 0 ? (
          <StructureTree {...structure} />
        ) : (
          <p className="ui-muted">没有可解析结构。</p>
        )}
      </PanelBody>
    </DetailPanel>
  );
}
