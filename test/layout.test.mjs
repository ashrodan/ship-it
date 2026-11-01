// scripts/add-to-layout.py: a fresh layout, an older install, and a second
// run that changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../scripts/add-to-layout.py", import.meta.url).pathname;
const block = (id, mod) => ({ id, type: "block", content: { mod } });
const layout = (panels, active = "files") => ({
  root: { id: "root", type: "column", children: [block("tabs", "tabs"), { id: "work", type: "row", children: [
    { id: "main", type: "block", content: { tab: "active" } },
    { id: "panel", type: "column", children: [{ id: "panel-body", type: "stack", active, children: panels }] },
  ] }] },
});
function run(json, backups = []) {
  const dir = mkdtempSync(join(tmpdir(), "ship-it-layout-")), file = join(dir, "mine.json");
  writeFileSync(file, JSON.stringify(json));
  for (const b of backups) writeFileSync(file + b, "{}");
  const out = () => execFileSync("python3", [SCRIPT, file], { encoding: "utf8" });
  return { file, out, read: () => JSON.parse(readFileSync(file, "utf8")) };
}
const body = (l) => l.root.children[2]?.children?.[1]?.children?.[0] ?? l.root.children[1].children[1].children[0];
const panels = (l) => body(l).children.map((c) => [c.id, c.content.mod]);

test("fresh: the strip after the tab bar, Changes in Herdr's changes block", () => {
  const l = run(layout([block("files", "files"), block("changes", "changes")]));
  assert.match(l.out(), /changed: strip after the tab bar, Changes panel in the changes block, ship-it-review panel, ship-it-prs panel/);
  const after = l.read();
  assert.deepEqual(after.root.children.map((c) => c.id), ["tabs", "ship-it", "work"]);
  assert.deepEqual(panels(after), [["files", "files"], ["changes", "ship-it-changes"], ["ship-it-review", "ship-it-review"], ["ship-it-prs", "ship-it-prs"]]);
  assert.ok(existsSync(l.file + ".before-ship-it"));
  assert.match(l.out(), /already has Ship it's blocks/);
  assert.deepEqual(l.read(), after);
});

test("an older install: its ship-it-changes block goes, the first backup stays", () => {
  const old = layout([block("files", "files"), block("changes", "changes"), block("ship-it-changes", "ship-it-changes"), block("ship-it-review", "ship-it-review"), block("ship-it-prs", "ship-it-prs")], "ship-it-changes");
  old.root.children.splice(1, 0, { id: "ship-it", type: "block", size: { px: 40 }, content: { mod: "ship-it" } });
  const l = run(old, [".before-ship-it"]);
  assert.match(l.out(), /Changes panel in the changes block, old ship-it-changes block removed/);
  const after = l.read();
  assert.deepEqual(panels(after), [["files", "files"], ["changes", "ship-it-changes"], ["ship-it-review", "ship-it-review"], ["ship-it-prs", "ship-it-prs"]]);
  assert.equal(body(after).active, "changes");
  assert.equal(readFileSync(l.file + ".before-ship-it", "utf8"), "{}");
  assert.ok(existsSync(l.file + ".before-ship-it-changes"));
});

test("no changes block: Changes gets its own", () => {
  const l = run(layout([block("files", "files")]));
  l.out();
  assert.deepEqual(panels(l.read()).map(([id]) => id), ["files", "ship-it-changes", "ship-it-review", "ship-it-prs"]);
});
