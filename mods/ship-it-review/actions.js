// The review's quick writes on the pull request: draft ↔ ready, and who it
// is assigned to. Each is one gh call, run only on a click.

import { exec } from "herdr";

// { args, busy, done } to flip an open PR between draft and ready; null for
// a merged or closed one.
export function draftAction(pr) {
  if (!pr || pr.state !== "OPEN") return null;
  const n = String(pr.number);
  return pr.isDraft
    ? { args: ["pr", "ready", n], label: "Ready for review", busy: "Marking ready…", done: `#${n} is ready for review` }
    : { args: ["pr", "ready", n, "--undo"], label: "Convert to draft", busy: "Converting…", done: `#${n} is a draft again` };
}

// Add or remove one assignee ("@me" is the person gh is logged in as).
export function assignAction(pr, login, add) {
  if (!pr || !login) return null;
  const n = String(pr.number);
  return add
    ? { args: ["pr", "edit", n, "--add-assignee", login], busy: "Assigning…", done: `#${n} assigned to ${login === "@me" ? "you" : login}` }
    : { args: ["pr", "edit", n, "--remove-assignee", login], busy: "Unassigning…", done: `${login === "@me" ? "You are" : `${login} is`} off #${n}` };
}

// Runs a gh write; throws gh's own message on failure.
export async function runAction(root, on, action) {
  const r = await exec("gh", action.args, { cwd: root, on });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "gh failed").trim().split("\n")[0]);
  return r;
}

// Who gh is logged in as, once per machine ("" when unknown).
const viewers = new Map();
export function viewer(root, on) {
  const key = on ?? "";
  if (!viewers.has(key)) {
    viewers.set(key, exec("gh", ["api", "user", "--jq", ".login"], { cwd: root, on })
      .then((r) => (r.code === 0 ? r.stdout.trim() : ""))
      .catch(() => "")
      // A failed lookup (offline, logged out) is asked again next time.
      .then((login) => { if (!login) viewers.delete(key); return login; }));
  }
  return viewers.get(key);
}
