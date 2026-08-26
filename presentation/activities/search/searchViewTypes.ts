import type { SearchDomain } from "../../../application/search/searchTypes";

export type SearchRepositoryOption = {
  id: string;
  label: string;
};

export const searchDomainLabels: Record<SearchDomain, string> = {
  journal: "日记",
  todo: "代办",
  workspace: "本地仓库",
};
