import { CalendarPlus, Clock3 } from "lucide-react";

type TimestampMetadata = {
  createdAt: string;
  updatedAt: string;
};

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

function TimeValue({
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
      className="note-time-value"
      dateTime={timestamp}
      title={`${label}：${timestamp}`}
    >
      <Icon aria-hidden="true" size={12} />
      <span>{formatTimestamp(timestamp)}</span>
    </time>
  );
}

function TimeRow({
  ariaLabel,
  label,
  metadata,
  updatedLabel,
}: {
  ariaLabel: string;
  label: string;
  metadata: TimestampMetadata;
  updatedLabel: string;
}) {
  return (
    <div aria-label={ariaLabel} className="note-time-row">
      <span className="note-time-kind">{label}</span>
      <TimeValue
        label={`${label}创建时间`}
        timestamp={metadata.createdAt}
        type="created"
      />
      <TimeValue
        label={`${label}${updatedLabel}时间`}
        timestamp={metadata.updatedAt}
        type="updated"
      />
    </div>
  );
}

export function NoteTimeDetails({
  blockMetadata,
  noteMetadata,
}: {
  blockMetadata: TimestampMetadata | null;
  noteMetadata: TimestampMetadata;
}) {
  return (
    <div aria-label="时间信息" className="note-time-details">
      <TimeRow
        ariaLabel="笔记时间"
        label="笔记"
        metadata={noteMetadata}
        updatedLabel="修改"
      />
      {blockMetadata ? (
        <TimeRow
          ariaLabel="块时间"
          label="当前块"
          metadata={blockMetadata}
          updatedLabel="更新"
        />
      ) : null}
    </div>
  );
}
