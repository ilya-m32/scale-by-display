export interface ILogger {
  error: (...errs: string[]) => void;
}

export const DEFAULT_SCALING_FACTOR = 1;

export const EXT_SCHEMA = "org.gnome.shell.extensions.scale-by-display";
export const DASH_TO_DOCK_SCHEMA = "org.gnome.shell.extensions.dash-to-dock";
export const GNOME_SETTINGS_SCHEMA = "org.gnome.desktop.interface";
export const FONT_SCALING_FACTOR_KEY = "text-scaling-factor";
