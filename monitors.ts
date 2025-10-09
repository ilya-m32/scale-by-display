import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

export interface Monitor {
  index: number;
  active: boolean;
  connector: string;
  vendor: string;
  product: string;
  serial: string;
  displayName: string;
  isPrimary: boolean;
}

type MonitorSpecs = [connector: string, vendor: string, product: string, serial: string];

type ResourceLogicalMonitor = [
  unknown,
  unknown,
  unknown,
  unknown,
  isPrimary: boolean,
  monitorSpecs: MonitorSpecs[],
];

type ResourceMonitor = [MonitorSpecs, unknown, { "display-name": { unpack: () => string } }];

type Resource = [unknown, ResourceMonitor[], ResourceLogicalMonitor[]];

const XML_INTERFACE_SCHEMA =
  '<node>\
    <interface name="org.gnome.Mutter.DisplayConfig">\
    <method name="GetCurrentState">\
    <arg name="serial" direction="out" type="u" />\
    <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />\
    <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />\
    <arg name="properties" direction="out" type="a{sv}" />\
    </method>\
    <signal name="MonitorsChanged" />\
    </interface>\
    </node>';

const initProxyWrapper = Gio.DBusProxy.makeProxyWrapper(XML_INTERFACE_SCHEMA);

/**
 * Based on dash-to-dock MonitorsConfig class
 * {@link https://github.com/micheleg/dash-to-dock/blob/816d585207c2964225b33ab944766b0b62e65de4/prefs.js#L41 Source}
 */
class MonitorsConfigDisplayScalingExtImpl extends GObject.Object {
  #monitorsConfigProxy?: ReturnType<typeof initProxyWrapper> | null;
  #configProxySignal: unknown;
  #primaryMonitor?: Monitor;
  #monitors: Monitor[] = [];
  #hadInitRun = false;
  #initRunSignal?: number;

  constructor() {
    super();

    initProxyWrapper(
      Gio.DBus.session,
      "org.gnome.Mutter.DisplayConfig",
      "/org/gnome/Mutter/DisplayConfig",
      (proxyWrapper, error) => {
        this.#monitorsConfigProxy ??= proxyWrapper;

        // Connecting to a D-Bus signal
        // biome-ignore lint/suspicious/noExplicitAny: wrong typings?
        this.#configProxySignal = (this.#monitorsConfigProxy?.connectSignal as any)?.(
          "MonitorsChanged",
          this.#updateResources.bind(this),
        );

        this.#initRunSignal = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          if (!this.#hadInitRun) {
            this.#updateResources();
          }
          this.#initRunSignal = void 0;
          return GLib.SOURCE_REMOVE; // Ensures this only runs once
        });
      },
    );
  }

  disconnectAll() {
    if (this.#configProxySignal != null) {
      this.#monitorsConfigProxy?.disconnectSignal(this.#configProxySignal);
    }
    if (this.#initRunSignal != null) {
      GLib.Source.remove(this.#initRunSignal);
    }
  }

  #updateResources() {
    this.#hadInitRun = true;
    this.#monitorsConfigProxy?.GetCurrentStateRemote(this.#updateResourcesState.bind(this));
  }

  #updateResourcesState(resourceState: Resource, err?: Error | string) {
    // Reset previous state on update
    this.#monitors = [];
    this.#primaryMonitor = void 0;

    if (err) {
      logError(err);
      return;
    }

    const [_serial, monitors, logicalMonitors] = resourceState;
    let index = 0;
    for (const monitor of monitors) {
      const [monitorSpecs, modes_, props] = monitor;
      const [connector, vendor, product, serial] = monitorSpecs;
      this.#monitors.push({
        index: index++,
        active: false,
        isPrimary: false,
        connector,
        vendor,
        product,
        serial,
        displayName: props["display-name"].unpack(),
      });
    }

    for (const logicalMonitor of logicalMonitors) {
      const [x_, y_, scale_, transform_, isPrimary, monitorsSpecs] = logicalMonitor;

      // We only care about the first one really
      for (const monitorSpecs of monitorsSpecs) {
        const [connector, vendor, product, serial] = monitorSpecs;
        const monitor = this.#monitors.find(
          (m) =>
            m.connector === connector &&
            m.vendor === vendor &&
            m.product === product &&
            m.serial === serial,
        );
        if (!monitor) continue;

        monitor.active = true;
        monitor.isPrimary = isPrimary;

        if (isPrimary) {
          this.#primaryMonitor = monitor;
        }
      }
    }

    const activeMonitors = this.#monitors.filter((m) => m.active);
    if (activeMonitors.length > 1 && logicalMonitors.length === 1) {
      // We're in cloning mode, so let's just activate the primary monitor
      this.#monitors.forEach((m) => {
        m.active = false;
      });

      if (this.#primaryMonitor) {
        this.#primaryMonitor.active = true;
      }
    }

    this.emit("updated");
  }

  get primaryMonitor() {
    return this.#primaryMonitor;
  }

  get monitors() {
    return this.#monitors;
  }
}

export function getMonitorIdentifier(monitors: Monitor[], withSerials: boolean) {
  return monitors
    .map((monitor) =>
      [
        monitor.vendor,
        monitor.product,
        ...(withSerials ? [monitor.serial] : []),
        monitor.active ? "active" : "inactive",
      ]
        .join("-"),
    )
    .sort();
}

export const MonitorsConfig = GObject.registerClass(
  {
    Signals: {
      updated: {},
    },
  },
  MonitorsConfigDisplayScalingExtImpl,
);

export type MonitorsConfigType = MonitorsConfigDisplayScalingExtImpl;
