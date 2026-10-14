import { describe, expect, it } from "vitest";
import { buildLatestJson } from "./latest-json.mjs";

const input = {
  version: "0.3.1",
  notes: "Fixes the thing.\n",
  pubDate: "2026-10-20T15:04:05.000Z",
  url: "https://github.com/alxvallejo/folio/releases/download/v0.3.1/Folio.app.tar.gz",
  signature: "dW50cnVzdGVkIGNvbW1lbnQ=\n",
};

describe("buildLatestJson", () => {
  it("builds the updater manifest for Apple Silicon", () => {
    expect(buildLatestJson(input)).toEqual({
      version: "0.3.1",
      notes: "Fixes the thing.",
      pub_date: "2026-10-20T15:04:05.000Z",
      platforms: { "darwin-aarch64": { signature: "dW50cnVzdGVkIGNvbW1lbnQ=", url: input.url } },
    });
  });

  it("refuses a non-SemVer version, an empty url or an empty signature", () => {
    expect(() => buildLatestJson({ ...input, version: "v0.3.1" })).toThrow(/SemVer/);
    expect(() => buildLatestJson({ ...input, url: "" })).toThrow(/url/);
    expect(() => buildLatestJson({ ...input, signature: " \n" })).toThrow(/signature/);
  });
});
