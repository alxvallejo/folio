import { describe, expect, it } from "vitest";
import { bumpCargoLock, bumpCargoToml, bumpTauriConf, compareSemver, isSemver } from "./version.mjs";

describe("isSemver", () => {
  it("accepts plain X.Y.Z only", () => {
    expect(isSemver("0.3.0")).toBe(true);
    expect(isSemver("10.20.30")).toBe(true);
    for (const v of ["v0.3.0", "0.3", "0.3.0-beta.1", "0.03.0", " 0.3.0", ""]) expect(isSemver(v)).toBe(false);
  });
});

describe("compareSemver", () => {
  it("compares numerically, not as strings", () => {
    expect(compareSemver("0.10.0", "0.9.9")).toBe(1);
    expect(compareSemver("0.3.0", "0.3.0")).toBe(0);
    expect(compareSemver("0.2.9", "0.3.0")).toBe(-1);
    expect(compareSemver("1.0.0", "0.99.99")).toBe(1);
  });
});

describe("bump helpers", () => {
  it("bumps only the app version in tauri.conf.json, keeping its formatting", () => {
    const text = '{\n  "productName": "Folio",\n  "version": "0.2.0",\n  "app": { "windows": [ { "title": "Folio" } ] }\n}\n';
    expect(bumpTauriConf(text, "0.3.0")).toBe(text.replace('"0.2.0"', '"0.3.0"'));
  });

  it("bumps only the package version in Cargo.toml", () => {
    const text = '[package]\nname = "folio"\nversion = "0.2.0"\n\n[dependencies]\ntauri = { version = "2", features = [] }\nserde = { version = "1" }\n';
    expect(bumpCargoToml(text, "0.3.0")).toBe(text.replace('version = "0.2.0"', 'version = "0.3.0"'));
  });

  it("bumps only folio's entry in Cargo.lock", () => {
    const text = '[[package]]\nname = "fnv"\nversion = "1.0.7"\n\n[[package]]\nname = "folio"\nversion = "0.2.0"\ndependencies = [\n "serde",\n]\n';
    expect(bumpCargoLock(text, "0.3.0")).toBe(text.replace('"0.2.0"', '"0.3.0"'));
  });

  it("throws instead of silently writing nothing when the version line is missing", () => {
    expect(() => bumpTauriConf("{}", "0.3.0")).toThrow(/tauri.conf.json/);
    expect(() => bumpCargoToml("[package]\n", "0.3.0")).toThrow(/Cargo.toml/);
    expect(() => bumpCargoLock('[[package]]\nname = "fnv"\nversion = "1.0.7"\n', "0.3.0")).toThrow(/Cargo.lock/);
  });
});
