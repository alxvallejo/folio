import { applyPatch, effectiveSettings, parseConfig, serializeConfig, type RawConfig, type Settings } from "./schema";

export interface ConfigIO {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export interface SettingsState {
  settings: Settings;
  /** Parse error while config.json holds invalid JSON; null when it's fine. */
  invalid: string | null;
  loaded: boolean;
}

export interface SettingsStore {
  getState(): SettingsState;
  subscribe(listener: () => void): () => void;
  /** Reads config.json. Call on startup and on every `config-changed` event. */
  load(): Promise<void>;
  update(patch: Partial<Settings>): Promise<void>;
}

export function createSettingsStore(io: ConfigIO, notify: (message: string) => void): SettingsStore {
  let raw: RawConfig = {};
  let state: SettingsState = { settings: effectiveSettings(raw), invalid: null, loaded: false };
  // False after a failed read: raw is then a guess, so writing it could clobber the real file.
  let lastReadOk = true;
  let firstLoad: Promise<void> | null = null;
  let warnedUnsaved = false;
  const listeners = new Set<() => void>();

  const set = (next: SettingsState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  function ingest(source: string | null) {
    const parsed = source === null ? ({ ok: true, raw: {} } as const) : parseConfig(source);
    if (!parsed.ok) {
      set({ ...state, invalid: parsed.error, loaded: true });
      notify(`config.json has invalid JSON. Keeping the previous settings. (${parsed.error})`);
      return;
    }
    warnedUnsaved = false;
    // Same content as we already hold (e.g. the echo of our own write): nothing to apply.
    if (state.loaded && !state.invalid && serializeConfig(parsed.raw) === serializeConfig(raw)) return;
    raw = parsed.raw;
    set({ settings: effectiveSettings(raw), invalid: null, loaded: true });
  }

  async function doLoad() {
    try {
      const source = await io.read();
      lastReadOk = true;
      ingest(source);
    } catch (e) {
      lastReadOk = false;
      notify(`Couldn't read config.json: ${String(e)}`);
      if (!state.loaded) set({ ...state, loaded: true });
    }
  }

  function load() {
    const run = doLoad();
    firstLoad ??= run;
    return run;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    load,

    async update(patch) {
      await (firstLoad ?? load());
      raw = applyPatch(raw, patch);
      set({ ...state, settings: effectiveSettings(raw) });
      if (state.invalid || !lastReadOk) {
        if (!warnedUnsaved) {
          notify(
            state.invalid
              ? "config.json has invalid JSON, so changes aren't saved until you fix it."
              : "config.json couldn't be read, so changes aren't saved until it can be.",
          );
        }
        warnedUnsaved = true;
        return;
      }
      try {
        await io.write(serializeConfig(raw));
      } catch (e) {
        notify(`Couldn't save config.json: ${String(e)}`);
      }
    },
  };
}
