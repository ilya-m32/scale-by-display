import type GObject from "gi://GObject";

export class ManagedConnects {
  #connections: Map<GObject.Object, { signalIds: number[] }> = new Map();

  connect<F extends () => unknown>(object: GObject.Object, signal: string, method: F) {
    if (!object || typeof object.connect !== "function") {
      throw new Error("Provided object does not have a connect method");
    }

    const signalIds = this.#connections.get(object)?.signalIds ?? [];
    signalIds.push(object.connect(signal, method));

    this.#connections.set(object, { signalIds });
  }

  disconnectAll() {
    for (const [object, { signalIds }] of this.#connections.entries()) {
      signalIds.forEach((signalId) => object.disconnect(signalId));
      this.#connections.delete(object);
    }
  }
}
