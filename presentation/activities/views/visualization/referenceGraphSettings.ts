export type GraphDisplaySettings = {
  labelDensity: number;
  linkThickness: number;
  nodeScale: number;
  showArrows: boolean;
};

export type GraphForceSettings = {
  centerStrength: number;
  linkDistance: number;
  linkStrength: number;
  repulsion: number;
};

export type ReferenceGraphSettings = {
  display: GraphDisplaySettings;
  forces: GraphForceSettings;
};

export const defaultReferenceGraphSettings: Readonly<ReferenceGraphSettings> = {
  display: {
    labelDensity: 75,
    linkThickness: 1,
    nodeScale: 1,
    showArrows: false,
  },
  forces: {
    centerStrength: 0.8,
    linkDistance: 110,
    linkStrength: 0.35,
    repulsion: 260,
  },
};

let sessionSettings = createDefaultReferenceGraphSettings();

export function createDefaultReferenceGraphSettings(): ReferenceGraphSettings {
  return {
    display: { ...defaultReferenceGraphSettings.display },
    forces: { ...defaultReferenceGraphSettings.forces },
  };
}

export function getReferenceGraphSessionSettings() {
  return sessionSettings;
}

export function setReferenceGraphSessionSettings(
  settings: ReferenceGraphSettings,
) {
  sessionSettings = settings;
}
