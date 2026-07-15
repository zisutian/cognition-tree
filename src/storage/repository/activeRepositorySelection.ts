export type ActiveRepositorySelection = {
  load: () => string | null;
  save: (repositoryId: string) => void;
};
