import assert from "node:assert/strict";
import { test } from "node:test";
import { PROVIDERS, safeWebhookUrl } from "../src/lib/integration-catalog.ts";

test("every provider has a unique id and at least one required field", () => {
  assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, PROVIDERS.length);
  for (const p of PROVIDERS) assert.ok(p.fields.some((f) => f.required), p.id);
});

test("webhooks only go to public HTTPS hosts", () => {
  for (const ok of ["https://hooks.zapier.com/hooks/catch/1/abc", "https://example.com:8443/x"]) assert.equal(safeWebhookUrl(ok), true, ok);
  for (const bad of [
    "http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/", "https://192.168.1.1/",
    "https://172.20.0.1/", "https://169.254.169.254/latest", "https://[::1]/", "https://user:pw@example.com/", "https://intranet/",
    "https://db.internal/", "ftp://example.com", "not a url",
  ]) assert.equal(safeWebhookUrl(bad), false, bad);
});
