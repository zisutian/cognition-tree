import type {
  SearchControllerState,
} from "../../../application/search/searchController";
import {
  ToolDetailPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import { groupSearchResults } from "./SearchPanel";
import { searchDomainLabels } from "./searchViewTypes";

function searchStatusLabel(state: SearchControllerState) {
  if (state.status === "loading") return "搜索中";
  if (state.errorMessage) return "失败";
  if (state.submitted) return "完成";
  return "未搜索";
}

export function SearchStatusPanel({
  onCollapseDetail,
  state,
}: {
  onCollapseDetail: () => void;
  state: SearchControllerState;
}) {
  const criteria = state.submitted ?? state.draft;
  const groups = groupSearchResults(state.results);

  return (
    <ToolDetailPanel
      aria-label="搜索状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">
        <ToolSectionStack>
          <ToolSection title="搜索">
            <ToolPropertyList aria-label="搜索状态">
              <ToolPropertyRow label="状态" value={searchStatusLabel(state)} />
              <ToolPropertyRow label="搜索词" value={criteria.query || "—"} />
              <ToolPropertyRow
                label="范围"
                value={criteria.domains.map((domain) =>
                  searchDomainLabels[domain]
                ).join("、") || "—"}
              />
              <ToolPropertyRow label="资源" value={groups.length} />
              <ToolPropertyRow label="命中" value={state.results.length} />
            </ToolPropertyList>
          </ToolSection>
          {state.faults.length > 0 || state.errorMessage ? (
            <ToolSection title="故障" tone="danger">
              <ToolPropertyList aria-label="搜索故障">
                {state.errorMessage ? (
                  <ToolPropertyRow label="错误" value={state.errorMessage} />
                ) : null}
                {state.faults.map((fault, index) => (
                  <ToolPropertyRow
                    key={`${fault.domain}:${fault.repositoryId ?? ""}:${fault.code}`}
                    label={`${searchDomainLabels[fault.domain]} ${index + 1}`}
                    value={fault.message}
                  />
                ))}
              </ToolPropertyList>
            </ToolSection>
          ) : null}
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolDetailPanel>
  );
}
