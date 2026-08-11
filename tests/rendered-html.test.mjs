import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

async function builtProduct() {
  const dist = new URL("../dist/", import.meta.url);
  const html = await readFile(new URL("index.html", dist), "utf8");
  const assetNames = await readdir(new URL("assets/", dist));
  const scriptNames = assetNames.filter((name) => name.endsWith(".js")).sort();
  assert.ok(
    scriptNames.some((name) => /^index-.*\.js$/.test(name)),
    "production JavaScript entry must exist",
  );
  const script = (
    await Promise.all(
      scriptNames.map((name) => readFile(join(dist.pathname, "assets", name), "utf8")),
    )
  ).join("\n");
  return { html, script };
}

test("builds the ClaimTrace SPA shell and product bundle", async () => {
  const { html, script } = await builtProduct();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>ClaimTrace/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/index-.*\.js/);
  assert.match(script, /Every claim should explain why it holds/);
  assert.match(script, /Community Chronic-Disease Follow-Up Prioritization/);
  assert.match(script, /Claim Rules/);
  assert.match(script, /EXECUTIVE READOUT/);
  assert.match(script, /Governance state at a glance/);
  assert.match(script, /unique primary key/i);
  assert.match(script, /4,218 follow-up records/);
  assert.match(script, /286 validation samples/);
  assert.match(script, /adds 9 false negatives/);
  assert.match(script, /Baseline SHA-256/);
  assert.match(script, /Ten Executable Cases/);
  assert.match(script, /Six Public-Data Audits/i);
  assert.match(script, /U\.S\. Treasury Yield-Curve Period Audit/);
  assert.match(script, /AuditBundle exports may embed up to 500 KB of raw data per snapshot/);
  assert.doesNotMatch(script, /adds 17 false negatives/);
  assert.doesNotMatch(script, /Exports contain raw snapshot hashes, not upload activity/);
  assert.doesNotMatch(script, /baseline evidence snapshot is locked/i);
  assert.doesNotMatch(script, /Your site is taking shape/);
});

test("packages a Sites-compatible static Worker entry", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const workerSource = await readFile(workerUrl, "utf8");
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  );

  assert.match(workerSource, /env\?\.ASSETS\?\.fetch/);
  assert.match(workerSource, /embeddedResponse\(request\)/);
  assert.doesNotMatch(workerSource, /vinext|next\//i);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), /<title>ClaimTrace/);
  assert.equal(
    await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8"),
    await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  );
  const workerConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  assert.equal(workerConfig.main, "index.js");
  assert.equal(workerConfig.no_bundle, true);
  assert.equal(workerConfig.assets.directory, "../client");
});
