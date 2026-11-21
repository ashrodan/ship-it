// The review's quick writes (actions.js): the exact gh calls, run against a
// stand-in gh on PATH that records its arguments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { draftAction, assignAction, runAction, viewer } from "../mods/ship-it-review/actions.js";

const bin = mkdtempSync(join(tmpdir(), "ship-it-gh-"));
const log = join(bin, "args");
writeFileSync(join(bin, "gh"), `#!/bin/sh
printf '%s\\n' "$@" > "${log}"
if [ -n "$GH_FAIL" ]; then echo "GraphQL: Resource not accessible by integration" >&2; echo "second line" >&2; exit 1; fi
if [ "$1" = api ]; then echo octocat; fi
`);
chmodSync(join(bin, "gh"), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;
const called = () => readFileSync(log, "utf8").trim().split("\n");

test("draft ↔ ready: the gh call for each state, none once merged or closed", async () => {
  const draft = draftAction({ number: 7, state: "OPEN", isDraft: true });
  assert.equal(draft.label, "Ready for review");
  await runAction(bin, null, draft);
  assert.deepEqual(called(), ["pr", "ready", "7"]);
  const ready = draftAction({ number: 7, state: "OPEN", isDraft: false });
  assert.equal(ready.label, "Convert to draft");
  await runAction(bin, null, ready);
  assert.deepEqual(called(), ["pr", "ready", "7", "--undo"]);
  assert.equal(draftAction({ number: 7, state: "MERGED", isDraft: false }), null);
  assert.equal(draftAction({ number: 7, state: "CLOSED", isDraft: true }), null);
  assert.equal(draftAction(null), null);
});

test("assign and unassign: @me and a login", async () => {
  await runAction(bin, null, assignAction({ number: 9 }, "@me", true));
  assert.deepEqual(called(), ["pr", "edit", "9", "--add-assignee", "@me"]);
  const off = assignAction({ number: 9 }, "octocat", false);
  assert.equal(off.done, "octocat is off #9");
  await runAction(bin, null, off);
  assert.deepEqual(called(), ["pr", "edit", "9", "--remove-assignee", "octocat"]);
  assert.equal(assignAction({ number: 9 }, "@me", true).done, "#9 assigned to you");
  assert.equal(assignAction({ number: 9 }, "", true), null);
});

test("a refused write throws gh's first line", async () => {
  process.env.GH_FAIL = "1";
  try { await assert.rejects(runAction(bin, null, draftAction({ number: 7, state: "OPEN", isDraft: true })), /^Error: GraphQL: Resource not accessible by integration$/); }
  finally { delete process.env.GH_FAIL; }
});

test("viewer: who gh is logged in as, asked once", async () => {
  assert.equal(await viewer(bin, null), "octocat");
  assert.deepEqual(called(), ["api", "user", "--jq", ".login"]);
  writeFileSync(log, "");
  assert.equal(await viewer(bin, null), "octocat");
  assert.equal(readFileSync(log, "utf8"), "", "cached: gh not run again");
});
