export type ActiveRepositorySelection = {
  clear: () => void;
  load: () => string | null;
  save: (repositoryId: string) => void;
};
