import { CalendarPlus, Clock3 } from "lucide-react";
import type { UiOutlineNode } from "../../../application/workspace/projection/viewBlocks";
import { SymbolSlot } from "../../shared/primitives";

const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

export function BlockMetadataDetails({
  block,
}: {
  block: UiOutlineNode | null;
}) {
  if (!block) {
    return null;
  }

  return (
    <dl aria-label="块时间" className="note-block-metadata">
      <div>
        <dt>
          <SymbolSlot aria-hidden="true">
            <CalendarPlus aria-hidden="true" size={13} />
          </SymbolSlot>
          创建
        </dt>
        <dd>
          <time
            dateTime={block.metadata.createdAt}
            title={block.metadata.createdAt}
          >
            {formatTimestamp(block.metadata.createdAt)}
          </time>
        </dd>
      </div>
      <div>
        <dt>
          <SymbolSlot aria-hidden="true">
            <Clock3 aria-hidden="true" size={13} />
          </SymbolSlot>
          更新
        </dt>
        <dd>
          <time
            dateTime={block.metadata.updatedAt}
            title={block.metadata.updatedAt}
          >
            {formatTimestamp(block.metadata.updatedAt)}
          </time>
        </dd>
      </div>
    </dl>
  );
}
