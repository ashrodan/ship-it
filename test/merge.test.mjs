// The launch's plan: the merge method, and what the base branch's rules mean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePlan } from "../mods/ship-it/merge.js";

const repo = (pr, methods = {}) => ({ squashMergeAllowed: true, mergeCommitAllowed: true, rebaseMergeAllowed: true, ...methods, pullRequest: pr });

test("a clean pull request merges with no override", () => {
  assert.deepEqual(mergePlan(repo({ mergeStateStatus: "CLEAN", viewerCanMergeAsAdmin: true })), { method: "squash", override: false, refuse: false });
});

test("blocked by the rules: an override for who may bypass them, a refusal for who may not", () => {
  assert.deepEqual(mergePlan(repo({ mergeStateStatus: "BLOCKED", viewerCanMergeAsAdmin: true })), { method: "squash", override: true, refuse: false });
  assert.deepEqual(mergePlan(repo({ mergeStateStatus: "BLOCKED", viewerCanMergeAsAdmin: false })), { method: "squash", override: false, refuse: true });
  assert.equal(mergePlan(repo({ mergeStateStatus: "BLOCKED" })).refuse, true);
});

test("the method is the first the repo allows", () => {
  assert.equal(mergePlan(repo({}, { squashMergeAllowed: false })).method, "merge");
  assert.equal(mergePlan(repo({}, { squashMergeAllowed: false, mergeCommitAllowed: false })).method, "rebase");
});

test("no answer: a plain squash, never an override", () => {
  assert.deepEqual(mergePlan(null), { method: "squash", override: false, refuse: false });
});
