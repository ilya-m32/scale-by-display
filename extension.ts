/* extension.js
 */
import type GObject from "gi://GObject";
import Gio from "gi://Gio";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import { QuickToggle, SystemIndicator } from "resource:///org/gnome/shell/ui/quickSettings.js";
import { ManagedConnects } from "./managed-connects.js";
import { MonitorsConfig } from "./monitors.js";
import { type ProfilesManager, getProfileManager } from "./profile.js";
import {
  DASH_TO_DOCK_SCHEMA,
  DEFAULT_SCALING_FACTOR,
  EXT_SCHEMA,
  FONT_SCALING_FACTOR_KEY,
  GNOME_SETTINGS_SCHEMA,
} from "./shared.js";

export default class ScaleToDisplayExtension extends Extension {
  #profileManager?: ProfilesManager | null;

  #settings?: Gio.Settings | null;
  #extensionState: {
    hideA11yIcon: boolean;
    defaultScaleFactor: number;
    integrateDashToDock: boolean;
    defaultDashToDockIconSize?: number;
  } = {
    hideA11yIcon: false,
    integrateDashToDock: false,
    defaultScaleFactor: DEFAULT_SCALING_FACTOR,
  };

  #gnomeSettingsStore?: Gio.Settings | null;
  #dashToDockSettings?: Gio.Settings | null;

  #connections = new ManagedConnects();

  enable() {
    this.#settings ??= this.getSettings(EXT_SCHEMA);
    const monitorsConfig = new MonitorsConfig();

    this.#profileManager ??= getProfileManager(
      this.#settings,
      monitorsConfig,
      this.getLogger?.() ?? console,
    );

    const onUpdate = this.#onStateUpdate.bind(this);
    this.#connections.connect(Main.sessionMode, "updated", onUpdate);
    this.#connections.connect(this.#settings, "changed", onUpdate);
    this.#connections.connect(this.#profileManager, "updated", onUpdate);

    // Initially check the current state
    onUpdate();
  }

  disable() {
    /**
      * This extension affects the lock screen font scale factor as well, to maintain consistency with the main session.
      * Otherwise, the font scale factor would flicker after locking and unlocking the screen.
      */
    this.#connections.disconnectAll();

    this.#profileManager?.disconnectAll();
    this.#profileManager = null;

    this.#settings = null;
    this.#gnomeSettingsStore = null;
    this.#dashToDockSettings = null;

    this.#setScalingFactor(DEFAULT_SCALING_FACTOR);
  }

  #readSettings() {
    const settings = this.#settings!;

    const hideA11yIcon = settings.get_boolean("hide-a11y-icon") ?? false;
    const defaultScaleFactor =
      settings.get_double("default-scale-factor") ?? DEFAULT_SCALING_FACTOR;

    this.#extensionState = {
      hideA11yIcon,
      defaultScaleFactor,
      integrateDashToDock: settings.get_boolean("integrate-dash-to-dock") ?? false,
      defaultDashToDockIconSize: settings.get_int("default-dash-to-dock-icon-size"),
    };
  }

  #updateA11yIcon() {
    // biome-ignore lint/suspicious/noExplicitAny: missing a11y types
    const a11y = (Main.panel.statusArea as any)?.a11y.container;

    this.#extensionState.hideA11yIcon ? a11y.hide() : a11y.show();
  }

  #onStateUpdate() {
    this.#readSettings();

    this.#applyFontScalingBasedOnDisplays();
    this.#updateA11yIcon();
  }

  #applyFontScalingBasedOnDisplays() {
    const activeProfile = this.#profileManager!.getActiveProfile();

    const fontScaleFactor =
      activeProfile?.fontScaleFactor ?? this.#extensionState.defaultScaleFactor;
    const dashToDockIconSize = this.#extensionState.integrateDashToDock
      ? (activeProfile?.dashToDockIconSize ?? this.#extensionState.defaultDashToDockIconSize)
      : void 0;

    this.#setScalingFactor(fontScaleFactor, dashToDockIconSize);
  }

  #setScalingFactor(fontScaleFactor: number, dashToDockIconSize?: number) {
    this.#gnomeSettingsStore ??= new Gio.Settings({ schema: GNOME_SETTINGS_SCHEMA });
    this.#gnomeSettingsStore.set_double(FONT_SCALING_FACTOR_KEY, fontScaleFactor);

    if (dashToDockIconSize != null) {
      this.#dashToDockSettings ??= new Gio.Settings({ schema: DASH_TO_DOCK_SCHEMA });
      this.#dashToDockSettings.set_int("dash-max-icon-size", dashToDockIconSize);
    }
  }
}
