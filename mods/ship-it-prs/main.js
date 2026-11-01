// Pull requests: every open PR in the repo, in the side panel. A row opens
// the PR on GitHub; its number copies the link; its branch button opens the PR
// in a worktree space. This branch's PR is marked.
//
// data.js is a copy: edit mods/ship-it/data.js and run scripts/install.sh.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, shared, setShared, notify, theme, nextCommand, run, spaces, panes } from "herdr";
import { READ, location, ago, prLook, reviewLook, panelShown, Recent, tilde } from "./data.js";

const ICON = (name) => `mods/ship-it/icons/${name}.svg`;
const FIELDS = "number,title,author,isDraft,state,url,headRefName,isCrossRepository,baseRefName,reviewDecision,reviewRequests,updatedAt,additions,deletions,statusCheckRollup";
const FILTERS = [["all", "All"], ["mine", "Mine"], ["review", "To review"]];
const SEARCH = { all: "sort:updated-desc", mine: "author:@me sort:updated-desc", review: "review-requested:@me sort:updated-desc" };
const PAGE = 10;
// All open PRs, counted without fetching them (gh fills in {owner} and {repo}).
const TOTAL = "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN){totalCount}}}";

// One word for a PR's checks: "fail", "pending", "pass" or null (none).
function checkState(rollup) {
  let pending = false;
  for (const c of rollup ?? []) {
    const v = (c.conclusion || c.state || "").toUpperCase(), done = c.status ? c.status === "COMPLETED" : !["PENDING", "EXPECTED"].includes(v);
    if (!done) { pending = true; continue; }
    if (["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(v)) return "fail";
  }
  return rollup?.length ? (pending ? "pending" : "pass") : null;
}
const CHECK = { fail: ["circle-x", "ansi1", "Checks failing"], pending: ["circle-dot", "ansi3", "Checks running"], pass: ["circle-check", "ansi2", "Checks passed"] };

// ---- worktrees: a PR's branch checked out beside the repo, as a space

// The branch a PR is checked out on here: its own, or pr-<n> for a fork's.
const localBranch = (pr) => (pr.isCrossRepository ? `pr-${pr.number}` : pr.headRefName);
// Where Herdr's worktree mod puts checkouts, so the space nests under the repo's.
const slug = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

// The repo's checkouts by branch: { branch: path }.
async function worktrees(root, on) {
  const r = await exec("git", [...READ, "worktree", "list", "--porcelain"], { cwd: root, on });
  const out = {};
  for (const block of (r.code === 0 ? r.stdout : "").split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1], branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (path && branch) out[branch] = path;
  }
  return out;
}

// Fetch the PR's head from origin and check it out in a new worktree:
// its branch, tracking origin's (a local branch of that name is used as it
// is), or for a fork's PR pull/<n>/head on pr-<n>. Returns the path.
async function addWorktree(root, on, pr) {
  const git = async (args, what) => {
    const r = await exec("git", args, { cwd: root, on });
    if (r.code !== 0) throw new Error((r.stderr || `${what} failed`).trim().split("\n").pop());
    return r.stdout.trim();
  };
  const branch = localBranch(pr);
  const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], "git rev-parse");
  const main = common.endsWith("/.git") ? common.slice(0, -5) : common;
  const home = (await exec("sh", ["-c", 'printf %s "$HOME"'], { on })).stdout.trim();
  if (!home) throw new Error("Couldn't find the home folder");
  const path = `${home}/.herdr/worktrees/${main.split("/").pop()}/${slug(branch)}`;
  const local = (await exec("git", [...READ, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root, on })).code === 0;
  if (pr.isCrossRepository) {
    await git(["fetch", "origin", `pull/${pr.number}/head`], "git fetch");
    await git(local ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "FETCH_HEAD"], "git worktree add");
  } else {
    await git(["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], "git fetch");
    await git(local ? ["worktree", "add", path, branch] : ["worktree", "add", "--track", "-b", branch, path, `origin/${branch}`], "git worktree add");
  }
  return path;
}

// Show the space on that checkout, or make one (unnamed: it is called after
// the checkout and nests under the repo's space).
function showSpace(path, on) {
  const inside = (cwd) => cwd === path || cwd?.startsWith(path + "/");
  const s = spaces().find((s) => (s.machine ?? null) === (on ?? null)
    && (inside(s.folder) || panes().some((p) => inside(p.cwd) && s.tabs.some((t) => t.id === p.tab))));
  if (s) run("space.select", { id: s.id });
  else run("space.new", { folder: path, ...(on ? { machine: on } : {}) });
}

export default class PullRequests extends View {
  init(_p, cx) {
    this.prs = []; this.filter = "all"; this.last = null; this.limit = PAGE; this.trees = {};
    // Last list per folder: switching back shows it at once.
    this.memo = new Recent(12);
    this.refresh(cx);
    cx.timer.every(60000, (cx) => this.refresh(cx));
    cx.spawn(async (cx) => { for (;;) { this.command(await nextCommand(), cx); cx.notify(); } });
  }

  // ship-it-prs.more, .refresh, .all, .mine, .review, .worktree-<n>: bindable to keys.
  command(name, cx) {
    const c = String(name).replace(/^ship-it-prs[.:]/, ""), n = /^worktree[-:](\d+)$/.exec(c)?.[1];
    if (n) { const pr = this.prs.find((p) => p.number === Number(n)); if (pr) this.worktree(pr, cx); }
    else if (c === "more") { if (this.more) this.loadMore(cx); }
    else if (c === "refresh") this.refresh(cx, true);
    else if (SEARCH[c]) this.pick(c, cx);
  }

  key() {
    this.last = location(this.last);
    return JSON.stringify([this.last.cwd, this.last.on]);
  }

  // Hidden, it only notes that it is out of date; showing it catches up.
  shown() { return panelShown("ship-it-prs"); }

  refresh(cx, force) {
    if (!this.shown()) { this.stale = true; return; }
    // A load that never came back (its task dropped) blocks for 30 s at most.
    if (this.loading && !force && Date.now() - this.loading < 30000) return;
    const context = this.key(), { cwd, on } = this.last;
    if (context !== this.context) { this.context = context; this.limit = PAGE; this.recall(); }
    if (!cwd) return;
    const filter = this.filter, limit = this.limit, memo = this.memoKey();
    const started = this.loading = Date.now(); this.stale = false; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", [...READ, "rev-parse", "--show-toplevel"], { cwd, on });
        if (this.key() !== context) return;
        if (top.code !== 0) { this.error = "Not a git repository"; return; }
        const root = top.stdout.trim();
        // The newest by update, a page at a time; the filters are GitHub searches,
        // so Mine and To review aren't limited to the page already loaded.
        const [list, total, branch, trees] = await Promise.all([
          exec("gh", ["pr", "list", "--state", "open", "--limit", String(limit), "--search", SEARCH[filter], "--json", FIELDS], { cwd: root, on }),
          exec("gh", ["api", "graphql", "-F", "owner={owner}", "-F", "name={repo}", "-f", `query=${TOTAL}`, "--jq", ".data.repository.pullRequests.totalCount"], { cwd: root, on }).catch(() => null),
          exec("git", [...READ, "branch", "--show-current"], { cwd: root, on }),
          worktrees(root, on),
        ]);
        if (this.key() !== context || this.filter !== filter) return;
        if (list.code !== 0) {
          const err = (list.stderr || "").toLowerCase();
          this.error = err.includes("no git remote") || err.includes("no default remote") ? "No GitHub remote" : err.includes("auth") ? "gh is not logged in" : (list.stderr || "gh failed").trim().split("\n")[0];
          this.root = root; this.prs = []; return;
        }
        this.root = root; this.on = on; this.branch = branch.stdout.trim() || null; this.trees = trees;
        this.prs = JSON.parse(list.stdout || "[]");
        this.more = this.prs.length >= limit;
        const n = Number(total?.stdout?.trim());
        if (total?.code === 0 && total.stdout.trim() && Number.isFinite(n)) this.total = n;
        this.error = null;
        this.memo.set(memo, { root, on, branch: this.branch, trees, prs: this.prs, more: this.more, total: this.total, limit });
        // Shared state redraws every mod: write it only when it changes.
        const count = this.total ?? this.prs.length, was = shared("ship-it.prs");
        if (was?.root !== root || (was?.on ?? null) !== (on ?? null) || was?.count !== count) setShared("ship-it.prs", { root, on: on ?? null, count });
      } catch (e) { if (this.key() === context) this.error = String(e); }
      finally { if (this.loading === started) this.loading = 0; cx.notify(); }
    });
  }

  memoKey() { return `${this.context}#${this.filter}`; }

  // This folder and filter's last list, or nothing: shown while it loads.
  recall() {
    this.root = null; this.prs = []; this.error = null; this.branch = null; this.more = false; this.total = null; this.trees = {};
    const m = this.memo.get(this.memoKey());
    if (m) Object.assign(this, m);
  }

  pick(filter, cx) {
    if (filter === this.filter) return;
    const total = this.total;
    this.filter = filter; this.limit = PAGE; this.recall(); this.total ??= total;
    this.refresh(cx, true);
  }

  loadMore(cx) {
    if (this.loading) return;
    this.limit = this.prs.length + PAGE;
    this.refresh(cx, true);
  }

  // Open the PR in its worktree space: the one there is, else a new checkout.
  worktree(pr, cx) {
    if (this.opening || !this.root) return;
    const root = this.root, on = this.on, branch = localBranch(pr);
    this.opening = pr.number; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const path = (await worktrees(root, on))[branch] ?? await addWorktree(root, on, pr);
        if (this.root === root) this.trees = { ...this.trees, [branch]: path };
        showSpace(path, on);
      } catch (e) { notify({ title: `Couldn't open #${pr.number} in a worktree`, body: String(e.message ?? e), level: "error", timeout: 8 }); }
      finally { this.opening = null; cx.notify(); }
    });
  }

  icon(name, color, size = 14) { return svg(ICON(name)).size(size).flex_none().text_color(color); }

  row(pr, t) {
    const look = prLook(pr), review = reviewLook(pr.reviewDecision), check = CHECK[checkState(pr.statusCheckRollup)];
    const here = pr.headRefName === this.branch;
    return v_flex().id(`pr-${pr.number}`).flex_none().px(10).py(7).gap(3).rounded(7).cursor_pointer()
      .when(here, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
      .tooltip(`${pr.headRefName} → ${pr.baseRefName} · open on GitHub`).on_click((_e, cx) => cx.open_url(pr.url))
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(this.icon(look.icon, t[look.color] ?? t.muted, 13))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(pr.title))
        .when(Boolean(check), (e) => e.child(div().id(`pr-check-${pr.number}`).flex_none().tooltip(check[2]).child(this.icon(check[0], t[check[1]], 13)))))
      .child(h_flex().pl(21).gap(6).items_center().min_w(0).text_size(11).text_color(t.dim)
        .child(div().id(`pr-n-${pr.number}`).flex_none().text_color(t.muted).rounded(4).px(2).hover((s) => s.bg(t.raised)).tooltip("Copy link")
          .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(pr.url); notify({ title: `#${pr.number} link copied`, body: pr.url, level: "info", timeout: 2 }); })
          .child(`#${pr.number}`))
        .child(div().min_w(0).truncate().child(pr.author?.login ?? ""))
        .child(div().flex_none().child(`· ${ago(pr.updatedAt)}`))
        .when(here, (e) => e.child(div().flex_none().text_color(t.accent).child("· this branch")))
        .child(div().flex_1())
        .when(!here, (e) => {
          const path = this.trees[localBranch(pr)], busy = this.opening === pr.number;
          return e.child(div().id(`pr-tree-${pr.number}`).flex_none().rounded(4).p(2).hover((s) => s.bg(t.raised))
            .tooltip(path ? `Show its worktree space (${tilde(path)})` : `Check out ${localBranch(pr)} in a worktree and open it as a space`)
            .on_click((_e, cx) => { cx.stop_propagation(); this.worktree(pr, cx); })
            .child(this.icon(busy ? "loader" : "git-branch", path ? t.accent : t.dim, 12).when(busy, (i) => i.spin(800))));
        })
        .when(Boolean(review) && pr.reviewDecision !== "REVIEW_REQUIRED", (e) => e.child(div().flex_none().text_color(t[review.color]).child(review.label)))
        .child(div().flex_none().text_color(t.ansi2).child(`+${pr.additions}`))
        .child(div().flex_none().text_color(t.ansi1).child(`−${pr.deletions}`)));
  }

  render(cx) {
    if (this.shown() && (this.stale || this.key() !== this.context)) this.refresh(cx);
    const t = theme(), list = this.prs;
    const empty = this.error || (this.loading ? "Loading pull requests…" : this.filter === "all" ? "No open pull requests" : this.filter === "mine" ? "No open pull requests of yours" : "Nothing waiting for your review");
    return v_flex().id("ship-it-prs").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().whitespace_nowrap().child("Pull requests"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).whitespace_nowrap().child(`${this.total ?? this.prs.length} open`))
        .child(div().flex_1())
        .child(div().id("prs-refresh").size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Refresh")
          .on_click((_e, cx) => this.refresh(cx, true)).child(this.icon(this.loading ? "loader" : "refresh-cw", t.dim, 12))))
      .child(h_flex().flex_none().px(10).py(8).gap(4).border_b(1).border_color(t.border).children(FILTERS.map(([id, label]) => {
        const on = this.filter === id;
        return div().id(`prs-filter-${id}`).h(24).px(9).flex().items_center().rounded(6).cursor_pointer().text_size(12)
          .when(on, (e) => e.bg(t.selected).text_color(t.foreground)).when(!on, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
          .on_click((_e, cx) => this.pick(id, cx)).child(label);
      })))
      .child(v_flex().id("prs-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(2)
        .children(list.map((pr) => this.row(pr, t)))
        .when(this.more && list.length > 0, (e) => e.child(div().id("prs-more").mx(4).my(6).h(28).flex_none().flex().items_center().justify_center().rounded(7)
          .border_1().border_color(t.border).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.loadMore(cx)).child(this.loading ? "Loading…" : `Load ${PAGE} more`)))
        .when(!list.length, (e) => e.child(div().p(8).text_color(t.dim).child(empty))));
  }
}
