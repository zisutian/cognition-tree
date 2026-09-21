import {
  Stack as SectionStack,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import { Section } from "compact-ui";
import type { SearchControllerState } from "../../../application/search/index.ts";
import { Page, PageBody } from "../../ui/index.ts";
import { groupSearchResults } from "./SearchPanel.tsx";
import { searchDomainLabels } from "./searchViewTypes.ts";

function searchStatusLabel(state: SearchControllerState) {
  if (state.status === "loading") return "搜索中";
  if (state.errorMessage) return "失败";
  if (state.submitted) return "完成";
  return "未搜索";
}

export function SearchStatusPanel({ state }: { state: SearchControllerState }) {
  const criteria = state.submitted ?? state.draft;
  const groups = groupSearchResults(state.results);

  return (
    <Page aria-label="搜索状态">
      <PageBody>
        <SectionStack>
          <Section>
            <section aria-label="搜索状态">
              <ToolPropertyList>
                <ToolPropertyRow
                  label="状态"
                  children={searchStatusLabel(state)}
                />
                <ToolPropertyRow
                  label="搜索词"
                  children={criteria.query || "—"}
                />
                <ToolPropertyRow
                  label="范围"
                  children={
                    criteria.domains
                      .map((domain) => searchDomainLabels[domain])
                      .join("、") || "—"
                  }
                />
                <ToolPropertyRow label="资源" children={groups.length} />
                <ToolPropertyRow label="命中" children={state.results.length} />
              </ToolPropertyList>
            </section>
          </Section>
          {state.faults.length > 0 || state.errorMessage ? (
            <Section title="故障">
              <section aria-label="搜索故障">
                <ToolPropertyList>
                  {state.errorMessage ? (
                    <ToolPropertyRow
                      label="错误"
                      children={state.errorMessage}
                    />
                  ) : null}
                  {state.faults.map((fault, index) => (
                    <ToolPropertyRow
                      key={`${fault.domain}:${fault.repositoryId ?? ""}:${fault.code}`}
                      label={`${searchDomainLabels[fault.domain]} ${index + 1}`}
                      children={fault.message}
                    />
                  ))}
                </ToolPropertyList>
              </section>
            </Section>
          ) : null}
        </SectionStack>
      </PageBody>
    </Page>
  );
}
