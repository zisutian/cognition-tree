// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectBuiltInRepositoryViewModel,
  type BuiltInRepositoryViewModel,
} from "./builtInRepositoryViewModel.ts";
import {
  projectOrdinaryRepositoryViewModel,
  type OrdinaryRepositoryViewModel,
} from "./ordinaryRepositoryViewModel.ts";
import type { RepositoryApplication } from "./repositoryApplication.ts";

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
