export const PRESET_THEMES = {
  modern: {
    name: "Modern",
    buttonColor: "#0D47C7",
    textColor: "#FFFFFF",
    accentColor: "#6C63FF",
    bgColor: "#F9FAFB"
  },
  minimal: {
    name: "Minimal",
    buttonColor: "#111827",
    textColor: "#FFFFFF",
    accentColor: "#6B7280",
    bgColor: "#F3F4F6"
  },
  bold: {
    name: "Bold",
    buttonColor: "#DC2626",
    textColor: "#FFFFFF",
    accentColor: "#F97316",
    bgColor: "#FEF3C7"
  },
  warm: {
    name: "Warm",
    buttonColor: "#D97706",
    textColor: "#FFFFFF",
    accentColor: "#F59E0B",
    bgColor: "#FEF9E7"
  },
  cool: {
    name: "Cool",
    buttonColor: "#0891B2",
    textColor: "#FFFFFF",
    accentColor: "#06B6D4",
    bgColor: "#ECFDF5"
  }
};

export function getThemeByName(name) {
  return PRESET_THEMES[name] || PRESET_THEMES.modern;
}

export function getAllThemes() {
  return Object.entries(PRESET_THEMES).map(([key, theme]) => ({
    id: key,
    ...theme
  }));
}
