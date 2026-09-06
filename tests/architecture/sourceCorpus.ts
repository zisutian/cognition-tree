import type { SourceModules } from "./moduleImports";
import type { SourceRoot } from "./sourceArchitecture";

export const coreModules: SourceModules = Object.freeze(
  import.meta.glob("../../core/**/*.{ts,tsx,js,mjs,cjs,mts,cts}", {
    eager: true,
    import: "default",
    query: "?raw",
  }) as SourceModules,
);

export const contractModules: SourceModules = Object.freeze(
  import.meta.glob("../../contracts/**/*.{ts,tsx,js,mjs,cjs,mts,cts}", {
    eager: true,
    import: "default",
    query: "?raw",
  }) as SourceModules,
);

export const applicationModules: SourceModules = Object.freeze(
  import.meta.glob(
    "../../application/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    { eager: true, import: "default", query: "?raw" },
  ) as SourceModules,
);

export const infrastructureModules: SourceModules = Object.freeze(
  import.meta.glob(
    "../../infrastructure/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    { eager: true, import: "default", query: "?raw" },
  ) as SourceModules,
);

export const presentationModules: SourceModules = Object.freeze(
  import.meta.glob(
    "../../presentation/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    { eager: true, import: "default", query: "?raw" },
  ) as SourceModules,
);

export const toolingModules: SourceModules = Object.freeze(
  import.meta.glob(["../../tooling/**/*.{ts,tsx,js,mjs,cjs,mts,cts}", "../../*.{ts,tsx,js,mjs,cjs,mts,cts}"],
    { eager: true, import: "default", query: "?raw" }) as SourceModules,
);

export const sourceAssets: SourceModules = Object.freeze(
  import.meta.glob(["../../{application,contracts,core,infrastructure,presentation,tooling}/**/*.{css,json}", "../../*.{html,sh,json,yaml}", "../../ctn", "../../.githooks/*"],
    { eager: true, import: "default", query: "?raw" }) as SourceModules,
);

export const sourceModulesByRoot: Readonly<
  Record<SourceRoot, SourceModules>
> = Object.freeze({
  core: coreModules,
  contracts: contractModules,
  application: applicationModules,
  infrastructure: infrastructureModules,
  presentation: presentationModules,
  tooling: toolingModules,
});

export const sourceModules: SourceModules = Object.freeze(
  Object.assign({}, ...Object.values(sourceModulesByRoot)),
);

export function listSourceFiles(directory: string) {
  const prefix = `../../${directory}/`;

  return Object.keys(sourceModules)
    .filter((filePath) => filePath.startsWith(prefix))
    .sort();
}

export function selectSourceModules(directory: string): SourceModules {
  const selected = new Set(listSourceFiles(directory));

  return Object.freeze(Object.fromEntries(
    Object.entries(sourceModules).filter(([filePath]) =>
      selected.has(filePath)
    ),
  ));
}
