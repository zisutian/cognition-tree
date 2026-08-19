// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectBuiltInRepositoryViewModel,
  type BuiltInRepositoryViewModel,
} from "./builtInRepositoryViewModel";
import {
  projectOrdinaryRepositoryViewModel,
  type OrdinaryRepositoryViewModel,
} from "./ordinaryRepositoryViewModel";
import type { RepositoryApplication } from "./repositoryApplication";

export type RepositoryViewModel = OrdinaryRepositoryViewModel &
  BuiltInRepositoryViewModel;

export function createRepositoryViewModel(
  source: RepositoryApplication,
): RepositoryViewModel {
  return {
    ...projectOrdinaryRepositoryViewModel(source),
    ...projectBuiltInRepositoryViewModel(source.builtIns),
  };
}
