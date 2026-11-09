/**
 * Theme registry: every theme is a full set of CSS-variable overrides applied
 * via a `theme-<id>` class on <html> (see app/layout.tsx). The default theme
 * needs no class — it is whatever styles.css defines.
 *
 * Dark themes redefine the complete surface scale (background, cards, borders,
 * text) so no separate dark-mode switch is needed.
 */

export interface ThemeDef {
  id: string;
  name: string;
  dark: boolean;
  /** All values are CSS colors; keys mirror styles.css variables. */
  vars: Record<string, string>;
}

const LIGHT_TEXT = "#111827";
const LIGHT_MUTED = "#6b7280";
const LIGHT_LINE = "#e5e7eb";
const DARK_TEXT = "#f8fafc";
const DARK_MUTED = "#94a3b8";

function lightTheme(
  id: string,
  name: string,
  primary: string,
  primaryHover: string,
  surface: string,
  background: string,
): ThemeDef {
  return {
    id,
    name,
    dark: false,
    vars: {
      "--primary": primary,
      "--primary-foreground": "#ffffff",
      "--ring": primary,
      "--background": background,
      "--foreground": LIGHT_TEXT,
      "--surface": surface,
      "--card": "#ffffff",
      "--card-foreground": LIGHT_TEXT,
      "--popover": "#ffffff",
      "--popover-foreground": LIGHT_TEXT,
      "--secondary": surface,
      "--secondary-foreground": LIGHT_TEXT,
      "--muted": "#f3f4f6",
      "--muted-foreground": LIGHT_MUTED,
      "--accent": surface,
      "--accent-foreground": LIGHT_TEXT,
      "--border": LIGHT_LINE,
      "--input": LIGHT_LINE,
    },
  };
}

function darkTheme(
  id: string,
  name: string,
  surface: string,
  card: string,
  line: string,
  primary: string,
  primaryForeground = "#ffffff",
): ThemeDef {
  return {
    id,
    name,
    dark: true,
    vars: {
      "--primary": primary,
      "--primary-foreground": primaryForeground,
      "--ring": primary,
      "--background": surface,
      "--foreground": DARK_TEXT,
      "--surface": surface,
      "--card": card,
      "--card-foreground": DARK_TEXT,
      "--popover": card,
      "--popover-foreground": DARK_TEXT,
      "--secondary": card,
      "--secondary-foreground": "#e2e8f0",
      "--muted": card,
      "--muted-foreground": DARK_MUTED,
      "--accent": card,
      "--accent-foreground": DARK_TEXT,
      "--border": line,
      "--input": line,
    },
  };
}

/** All available themes. The first entry is the app default (styles.css values). */
export const THEMES: ThemeDef[] = [
  { id: "axiom-teal", name: "Axiom Teal (default)", dark: false, vars: {} },
  lightTheme("indigo-pulse", "Indigo Pulse", "#4f46e5", "#4338ca", "#f5f6ff", "#fdfdff"),
  lightTheme("sunset-orange", "Sunset Orange", "#ea580c", "#c2410c", "#fff4e8", "#fffdfa"),
  lightTheme("emerald-rush", "Emerald Rush", "#059669", "#047857", "#e9f8f1", "#f7fdfa"),
  lightTheme("blue-bolt", "Blue Bolt", "#2563eb", "#1d4ed8", "#ebf2ff", "#f9fbff"),
  lightTheme("fuchsia-bold", "Fuchsia Bold", "#c026d3", "#a21caf", "#f9effd", "#fefbfe"),
  darkTheme("midnight-emerald", "Midnight Emerald", "#0d1420", "#111a2b", "#22304a", "#10b981"),
  darkTheme("carbon-orange", "Carbon Orange", "#0a0a0a", "#141414", "#262626", "#fb923c", "#1c1917"),
  darkTheme("navy-glow", "Navy Glow", "#0b1120", "#111c33", "#22304a", "#3b82f6"),
  darkTheme("obsidian-violet", "Obsidian Violet", "#120d1f", "#1a1330", "#2e1f52", "#8b5cf6"),
  darkTheme("black-gold", "Black Gold", "#0c0a09", "#171412", "#292524", "#f59e0b", "#1c1917"),
  darkTheme("titanium-lime", "Titanium Lime", "#111114", "#18181b", "#27272a", "#f4f4f5", "#111114"),
];

export const DEFAULT_THEME_ID = "axiom-teal";

export function getTheme(id: string | null | undefined): ThemeDef | null {
  if (!id) return null;
  return THEMES.find((t) => t.id === id) ?? null;
}

/** Server-side only: the class to put on <html> for a theme id. */
export function themeClass(id: string | null | undefined): string {
  const t = getTheme(id);
  if (!t || t.id === DEFAULT_THEME_ID) return "";
  return `theme-${t.id}`;
}

/** Generates the .theme-<id> CSS blocks; paste output into styles.css (kept in sync manually). */
export function themeCss(): string {
  const skip = new Set(["axiom-teal"]);
  return THEMES.filter((t) => !skip.has(t.id))
    .map((t) => {
      const lines = Object.entries(t.vars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `.theme-${t.id} {\n  color-scheme: ${t.dark ? "dark" : "light"};\n${lines}\n}`;
    })
    .join("\n\n");
}
