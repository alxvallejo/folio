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
  let lastWritten: string | null = null;
  let warnedUnsaved = false;
  const listeners = new Set<() => void>();

  const set = (next: SettingsState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  function ingest(source: string | null) {
    if (source !== null && source === lastWritten && !state.invalid) return; // echo of our own write
    const parsed = source === null ? ({ ok: true, raw: {} } as const) : parseConfig(source);
    if (!parsed.ok) {
      set({ ...state, invalid: parsed.error, loaded: true });
      notify(`config.json has invalid JSON. Keeping the previous settings. (${parsed.error})`);
      return;
    }
    raw = parsed.raw;
    warnedUnsaved = false;
    set({ settings: effectiveSettings(raw), invalid: null, loaded: true });
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async load() {
      try {
        ingest(await io.read());
      } catch (e) {
        notify(`Couldn't read config.json: ${String(e)}`);
        if (!state.loaded) set({ ...state, loaded: true });
      }
    },

    async update(patch) {
      raw = applyPatch(raw, patch);
      set({ ...state, settings: effectiveSettings(raw) });
      if (state.invalid) {
        if (!warnedUnsaved) notify("config.json has invalid JSON, so changes aren't saved until you fix it.");
        warnedUnsaved = true;
        return;
      }
      const textToWrite = serializeConfig(raw);
      lastWritten = textToWrite;
      try {
        await io.write(textToWrite);
      } catch (e) {
        notify(`Couldn't save config.json: ${String(e)}`);
      }
    },
  };
}
