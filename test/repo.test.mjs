// The repo itself: the copies install.sh makes match their originals (a mod
// can't import from another mod's folder), and every mod file parses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const mods = new URL("../mods/", import.meta.url).pathname;
const read = (p) => readFileSync(join(mods, p), "utf8");

test("copies match their originals (run scripts/install.sh --sync)", () => {
  for (const copy of ["ship-it-review/data.js", "ship-it-changes/data.js", "ship-it-prs/data.js"]) assert.equal(read(copy), read("ship-it/data.js"), copy);
  assert.equal(read("ship-it-changes/files.js"), read("ship-it-review/files.js"), "ship-it-changes/files.js");
  const icons = readdirSync(join(mods, "ship-it/icons")).sort();
  assert.deepEqual(readdirSync(join(mods, "ship-it-review/icons")).sort(), icons);
  for (const icon of icons) assert.equal(read(`ship-it-review/icons/${icon}`), read(`ship-it/icons/${icon}`), icon);
});

test("every mod file parses, and each mod.json is JSON", () => {
  for (const mod of readdirSync(mods)) {
    for (const file of readdirSync(join(mods, mod))) {
      const path = join(mods, mod, file);
      if (file.endsWith(".js")) execFileSync(process.execPath, ["--input-type=module", "--check"], { input: readFileSync(path) });
      if (file === "mod.json") JSON.parse(readFileSync(path, "utf8"));
    }
  }
});

test("no class defines a method twice (the second wins, silently)", () => {
  for (const mod of readdirSync(mods)) {
    const main = read(`${mod}/main.js`);
    const names = [...main.matchAll(/^  (?:async )?([A-Za-z_]+)\(/gm)].map((m) => m[1]);
    const twice = names.filter((n, i) => names.indexOf(n) !== i && !["if", "for", "while", "switch", "catch", "setShared", "notify", "run"].includes(n));
    assert.deepEqual(twice, [], `${mod}/main.js`);
  }
});
