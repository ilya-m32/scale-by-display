import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type { ExtensionMetadata } from "resource:///org/gnome/shell/extensions/extension.js";
import { type Monitor, MonitorsConfig } from "./monitors.js";
import { type ProfilesManager, getProfileManager } from "./profile.js";

import { DEFAULT_SCALING_FACTOR } from "./shared.js";

export default class ScaleToDisplayPreferences extends ExtensionPreferences {
  #settings?: Gio.Settings;
  #monitorsConfig = new MonitorsConfig();

  #saveMonitorsAsProfileButton?: Gtk.Button;

  #monitorListWidget?: Adw.PreferencesGroup;
  #monitorRows: Adw.ActionRow[] = [];

  #profilesManager?: ProfilesManager;
  #profilesManagerSignal?: number;
  #profilesGroupWidget?: Adw.PreferencesGroup;
  #profilesWidgets: Adw.ActionRow[] = [];

  #updateMonitorList(window: Adw.Window): Adw.PreferencesGroup {
    this.#monitorListWidget ??= new Adw.PreferencesGroup({
      title: _("Monitors"),
      description: _("List of current monitors"),
    });

    // clean up old list
    this.#monitorRows.forEach((item) => this.#monitorListWidget!.remove(item));
    this.#monitorRows = [];

    for (const monitor of this.#monitorsConfig.monitors) {
      const monitorRow = this.#createMonitorRow(monitor);

      this.#monitorListWidget.add(monitorRow);
      this.#monitorRows.push(monitorRow);
    }

    if (!this.#saveMonitorsAsProfileButton) {
      this.#saveMonitorsAsProfileButton = new Gtk.Button({
        iconName: "list-add-symbolic",
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        marginTop: 16,
      });
      this.#saveMonitorsAsProfileButton.set_tooltip_text(_("Save as new profile"));
      this.#saveMonitorsAsProfileButton.set_label(_("Save as new profile"));
      this.#saveMonitorsAsProfileButton.connect(
        "clicked",
        this.#onChangeProfile.bind(this, window, { type: "add" }),
      );
      this.#monitorListWidget.add(this.#saveMonitorsAsProfileButton);
    }
    this.#saveMonitorsAsProfileButton.sensitive = !this.#profilesManager!.getActiveProfile();

    return this.#monitorListWidget;
  }

  #createMonitorRow(monitor: Monitor): Adw.ActionRow {
    const title = `${monitor.index}: ${monitor.vendor} ${monitor.product}`;

    const monitorRow = new Adw.ActionRow({
      title,
      subtitle: monitor.active ? _("Active") : _("Inactive"),
    });

    return monitorRow;
  }

  #updateProfilesGroup(window: Adw.Window) {
    this.#profilesGroupWidget ??= new Adw.PreferencesGroup({
      title: _("Profiles"),
      description: _("Configure profile actions"),
    });

    this.#profilesWidgets.forEach((widget) => this.#profilesGroupWidget!.remove(widget));
    this.#profilesWidgets = [];
    const activeProfile = this.#profilesManager!.getActiveProfile();
    this.#profilesManager!.getProfiles().forEach((profile, idx) => {
      const isActiveProfile = profile === activeProfile;
      const profileRow = new Adw.ActionRow({
        title: _(profile.name),
        subtitle: `${_("Monitors: ")}${profile.getMonitorsCount()} / ${isActiveProfile ? _("Active") : _("Inactive")}`,
      });

      const editButton = new Gtk.Button({
        iconName: "document-edit-symbolic",
        tooltipText: _("Edit Profile"),
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
      });
      editButton.connect(
        "clicked",
        this.#onChangeProfile.bind(this, window, { type: "update", idx }),
      );
      profileRow.add_suffix(editButton);

      const removeButton = new Gtk.Button({
        iconName: "list-remove-symbolic",
        tooltipText: _("Remove Profile"),
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
      });
      profileRow.add_suffix(removeButton);
      removeButton.connect("clicked", () => this.#profilesManager!.removeProfile(idx));

      this.#profilesWidgets.push(profileRow);
      this.#profilesGroupWidget!.add(profileRow);
    });

    return this.#profilesGroupWidget;
  }

  #onChangeProfile(window: Adw.Window, opts: { type: "add" } | { type: "update"; idx: number }) {
    const currentProfile =
      opts.type === "update" ? this.#profilesManager!.getActiveProfile() : null;

    const dialog = new Gtk.Dialog({
      title: "Change Profile",
      transient_for: window,
      useHeaderBar: 1,
    });
    const contentArea = dialog.get_content_area();

    const profileConfigGroup = new Adw.PreferencesGroup({
      title: _("Profile"),
      marginTop: 16,
      marginStart: 48,
      marginEnd: 48,
    });
    contentArea.append(profileConfigGroup);

    // controls
    dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
    const okButton = dialog.add_button("OK", Gtk.ResponseType.OK);

    const onProfileName = (entry: Adw.EntryRow, isFirstCall = false) => {
      const text = entry.get_text();
      const isValid =
        text !== "" &&
        !this.#profilesManager!.getProfiles().find(
          (profile, idx) => profile !== currentProfile && profile.name === text,
        );

      okButton.sensitive = isValid;
    };
    const profileNameEntryRow = new Adw.EntryRow({
      title: _("Profile name:"),
      input_purpose: Gtk.InputPurpose.FREE_FORM,
      text: currentProfile?.name ?? "",
    });
    profileNameEntryRow.connect("notify::text", onProfileName);
    // initial call
    onProfileName(profileNameEntryRow, true);
    profileConfigGroup.add(profileNameEntryRow);

    const profileParametersGroup = new Adw.PreferencesGroup({
      title: _("Profile parameters"),
      marginTop: 16,
      marginStart: 48,
      marginEnd: 48,
    });
    const formScaleFactorValue =
      currentProfile?.fontScaleFactor ?? this.#settings!.get_double("default-scale-factor") ?? 1;

    const scaleFactorInputRow = new Adw.SpinRow({
      title: _("Font scale factor"),
      subtitle: _("Font scale if this profile is active"),
      snapToTicks: true,
      digits: 2,
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 20,
        pageIncrement: 0.25,
        stepIncrement: 0.05,
      }),
    });
    scaleFactorInputRow.set_value(formScaleFactorValue);
    profileParametersGroup.add(scaleFactorInputRow);

    const dashToDockIconSizeRow = new Adw.SpinRow({
      title: _("Dash To Dock icon size"),
      subtitle: _("Dash To Dock icon size when this profile is active"),
      snapToTicks: true,
      digits: 0,
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 320,
        pageIncrement: 8,
        stepIncrement: 2,
      }),
    });
    dashToDockIconSizeRow.sensitive =
      this.#settings!.get_boolean("integrate-dash-to-dock") ?? false;
    dashToDockIconSizeRow.set_value(
      currentProfile?.dashToDockIconSize ??
        this.#settings!.get_int("default-dash-to-dock-icon-size") ??
        32,
    );
    profileParametersGroup.add(dashToDockIconSizeRow);
    contentArea.append(profileParametersGroup);

    const monitorListWidget = new Adw.PreferencesGroup({
      title: _("Monitors"),
      description: _("List of monitors used in this profile"),
      marginTop: 16,
      marginBottom: 48,
      marginStart: 48,
      marginEnd: 48,
    });
    for (const monitor of this.#monitorsConfig.monitors) {
      monitorListWidget.add(this.#createMonitorRow(monitor));
    }
    contentArea.append(monitorListWidget);

    dialog.connect("response", (dialog, response) => {
      if (response === Gtk.ResponseType.OK) {
        const profileName = profileNameEntryRow.get_text();
        const fontScaleFactor = Number.parseFloat(scaleFactorInputRow.get_value().toFixed(2));
        const dashToDockIconSize = dashToDockIconSizeRow.get_value();

        switch (opts.type) {
          case "add":
            this.#profilesManager!.appendProfile({
              monitors: this.#monitorsConfig.monitors,
              name: profileName,
              fontScaleFactor,
              dashToDockIconSize,
            });
            break;
          case "update":
            this.#profilesManager!.updateProfile(opts.idx, {
              name: profileName,
              fontScaleFactor,
              dashToDockIconSize,
            });
            break;
        }
      }
      dialog.close();
    });

    dialog.show();
  }

  #updatePreferenceWindow(window: Adw.Window) {
    // Update main widgets
    this.#updateProfilesGroup(window);
    this.#updateMonitorList(window);
  }

  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    this.#settings ??= this.getSettings();
    this.#profilesManager ??= getProfileManager(
      this.#settings,
      this.#monitorsConfig,
      this.getLogger?.() ?? console,
    );

    // General page
    const generalPage = new Adw.PreferencesPage({
      title: _("General"),
      iconName: "dialog-information-symbolic",
    });

    const globalSettingsGroup = new Adw.PreferencesGroup({
      title: _("Global settings"),
      description: _("Configure extension global settings"),
    });
    generalPage.add(globalSettingsGroup);

    // a11y icon
    const hideA11yIcon = new Adw.SwitchRow({
      title: _("Hide a11y icon"),
      subtitle: _("Whether to hide accessibility icon"),
    });
    this.#settings.bind("hide-a11y-icon", hideA11yIcon, "active", Gio.SettingsBindFlags.DEFAULT);
    globalSettingsGroup.add(hideA11yIcon);

    // default scale factor
    const defaultScaleFactor = new Adw.SpinRow({
      title: _("Default font scale"),
      subtitle: _("Activated if there's no matching profile"),
      snapToTicks: true,
      value: this.#settings!.get_double("default-scale-factor") ?? DEFAULT_SCALING_FACTOR,
      digits: 2,
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 20,
        pageIncrement: 0.25,
        stepIncrement: 0.05,
      }),
    });
    this.#settings.bind(
      "default-scale-factor",
      defaultScaleFactor,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    globalSettingsGroup.add(defaultScaleFactor);

    const extensionIntegrationsGroup = new Adw.PreferencesGroup({
      title: _("Dash to Dock"),
      description: _("Optional integrations with other extensions"),
    });
    generalPage.add(extensionIntegrationsGroup);

    // default dash-to-dock icon size
    const dashToDockSwitch = new Adw.SwitchRow({
      title: _("Enable integration"),
      subtitle: _("Enables dash to dock integration (icon sizes will be adjusted)"),
    });
    extensionIntegrationsGroup.add(dashToDockSwitch);

    this.#settings.bind(
      "integrate-dash-to-dock",
      dashToDockSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    const defaultDashToDockIconSize = new Adw.SpinRow({
      title: _("Default dash-to-dock icon size"),
      subtitle: _("Activated if there's no matching profile"),
      snapToTicks: true,
      digits: 0,
      adjustment: new Gtk.Adjustment({
        lower: 4,
        upper: 256,
        stepIncrement: 2,
      }),
    });
    this.#settings.bind(
      "default-dash-to-dock-icon-size",
      defaultDashToDockIconSize,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    this.#settings.bind(
      "integrate-dash-to-dock",
      defaultDashToDockIconSize,
      "sensitive",
      Gio.SettingsBindFlags.GET,
    );
    extensionIntegrationsGroup.add(defaultDashToDockIconSize);

    window.add(generalPage);

    // Profiles page
    const profilesPage = new Adw.PreferencesPage({
      title: _("Profiles"),
      iconName: "system-users-symbolic",
    });
    profilesPage.add(this.#updateProfilesGroup(window));
    profilesPage.add(this.#updateMonitorList(window));

    window.add(profilesPage);

    if (this.#profilesManagerSignal == null) {
      this.#profilesManagerSignal = this.#profilesManager.connect(
        "updated",
        this.#updatePreferenceWindow.bind(this, window),
      );
    }

    return Promise.resolve();
  }
}
