export type Theme = "dark" | "light";

export function resolveInitialTheme(saved: string | null, systemPrefersLight: boolean): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return systemPrefersLight ? "light" : "dark";
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
