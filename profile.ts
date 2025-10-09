import GObject from "gi://GObject";
import type Gio from "gi://Gio";
import { ManagedConnects } from "./managed-connects.js";
import type { Monitor, MonitorsConfigType } from "./monitors.js";
import { getMonitorIdentifier } from "./monitors.js";
import type { ILogger } from "./shared";

export interface IProfile {
  monitors: Monitor[];
  name: string;
  fontScaleFactor: number;
  dashToDockIconSize?: number;
}

class Profile {
  #monitors: Monitor[];
  name: string;
  fontScaleFactor: number;
  dashToDockIconSize?: number;

  #monitorsKeysSet: Set<string>;

  constructor(
    { monitors, name, fontScaleFactor, dashToDockIconSize }: IProfile,
    withSerials: boolean,
  ) {
    this.#monitors = monitors;
    this.name = name;
    this.fontScaleFactor = fontScaleFactor;
    this.dashToDockIconSize = dashToDockIconSize;

    const profileMonitorIdentifiers = getMonitorIdentifier(this.#monitors, withSerials);
    this.#monitorsKeysSet = new Set(getMonitorIdentifier(this.#monitors, withSerials));
  }

  getMonitorsCount() {
    return this.#monitors.length;
  }

  matchesCurrentMonitors(currentMonitorIdentifiers: string[]): boolean {
    if (currentMonitorIdentifiers.length !== this.#monitorsKeysSet.size) {
      return false;
    }

    return currentMonitorIdentifiers.every((item) => this.#monitorsKeysSet.has(item));
  }

  toJSON(): IProfile {
    return {
      name: this.name,
      fontScaleFactor: this.fontScaleFactor,
      dashToDockIconSize: this.dashToDockIconSize,
      monitors: this.#monitors,
    };
  }
}

class ProfilesManagerImpl extends GObject.Object {
  #settings: Gio.Settings;
  #monitorsConfig: MonitorsConfigType;

  #profiles: Profile[] = [];
  #activeProfile?: Profile | null;
  #logger: ILogger;
  #withSerials = false;

  #connections = new ManagedConnects();

  constructor(settings: Gio.Settings, monitorsConfig: MonitorsConfigType, logger: ILogger) {
    super();
    this.#settings = settings;
    this.#monitorsConfig = monitorsConfig;
    this.#logger = logger;

    const onUpdate = this.#onUpdate.bind(this);
    this.#connections.connect(this.#settings, "changed", onUpdate);
    this.#connections.connect(this.#monitorsConfig, "updated", onUpdate);

    this.#onUpdate();
  }

  disconnectAll() {
    this.#connections.disconnectAll();
    this.#monitorsConfig.disconnectAll();
  }

  getActiveProfile(): Profile | undefined {
    if (!this.#activeProfile) {
      const currentMonitorIdentifiers = getMonitorIdentifier(
        this.#monitorsConfig.monitors,
        this.#withSerials,
      );

      this.#activeProfile = this.#profiles.find((profile) =>
        profile.matchesCurrentMonitors(currentMonitorIdentifiers),
      );
    }

    return this.#activeProfile;
  }

  getProfiles() {
    return this.#profiles;
  }

  appendProfile(profile: IProfile) {
    this.#profiles.push(new Profile(profile, this.#withSerials));

    this.#syncProfiles();
  }

  updateProfile(idx: number, profileUpd: Partial<Profile>) {
    Object.assign(this.#profiles[idx], profileUpd);
    this.#syncProfiles();
  }

  removeProfile(idx: number) {
    this.#profiles.splice(idx, 1);
    this.#syncProfiles();
  }

  #onUpdate(updateProfilesList = true) {
    this.#activeProfile = null;
    this.#withSerials = this.#settings.get_boolean("with-serials") ?? true;

    updateProfilesList && this.#fetchProfiles();
  }

  #fetchProfiles() {
    try {
      this.#profiles = (JSON.parse(this.#settings.get_string("profiles"))?.profiles ?? []).map(
        // biome-ignore lint/suspicious/noExplicitAny: no schema parsing for now
        (rawProfile: any) => new Profile(rawProfile, this.#withSerials),
      );
      this.emit("updated");
    } catch (error: unknown) {
      this.#logger.error("Invalid profile configuration", String(error));
    }
  }

  #syncProfiles(): void {
    this.#settings.set_string("profiles", JSON.stringify({ profiles: this.#profiles }));
    // no need to emit update: it will be done by updating settings already
  }
}

export type ProfilesManager = ProfilesManagerImpl;

const ProfilesManagerRegistered = GObject.registerClass(
  {
    Signals: {
      updated: {},
    },
  },
  ProfilesManagerImpl,
);

export function getProfileManager(
  settings: Gio.Settings,
  monitorsConfig: MonitorsConfigType,
  logger: ILogger,
): ProfilesManager {
  return new ProfilesManagerRegistered(settings, monitorsConfig, logger);
}
