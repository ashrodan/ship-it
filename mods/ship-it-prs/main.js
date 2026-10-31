// Pull requests: every open PR in the repo, in the side panel. A row opens
// the PR on GitHub; its number copies the link. This branch's PR is marked.
//
// data.js is a copy: edit mods/ship-it/data.js and run scripts/install.sh.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, shared, setShared, notify, theme } from "herdr";
import { READ, location, ago, prLook, reviewLook, panelShown } from "./data.js";

const ICON = (name) => `mods/ship-it/icons/${name}.svg`;
const FIELDS = "number,title,author,isDraft,state,url,headRefName,baseRefName,reviewDecision,reviewRequests,updatedAt,additions,deletions,statusCheckRollup";
const FILTERS = [["all", "All"], ["mine", "Mine"], ["review", "To review"]];
const logins = {};

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

export default class PullRequests extends View {
  init(_p, cx) {
    this.prs = []; this.filter = "all"; this.last = null;
    this.refresh(cx);
    cx.timer.every(60000, (cx) => this.refresh(cx));
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
    if (context !== this.context) { this.context = context; this.root = null; this.prs = []; this.error = null; this.branch = null; }
    if (!cwd) return;
    const started = this.loading = Date.now(); this.stale = false; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", [...READ, "rev-parse", "--show-toplevel"], { cwd, on });
        if (this.key() !== context) return;
        if (top.code !== 0) { this.error = "Not a git repository"; return; }
        const root = top.stdout.trim();
        const [list, branch] = await Promise.all([
          exec("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", FIELDS], { cwd: root, on }),
          exec("git", [...READ, "branch", "--show-current"], { cwd: root, on }),
        ]);
        const who = on in logins ? logins[on] : (logins[on] = await exec("gh", ["api", "user", "--jq", ".login"], { on }).then((r) => r.stdout.trim() || null).catch(() => null));
        if (this.key() !== context) return;
        if (list.code !== 0) {
          const err = (list.stderr || "").toLowerCase();
          this.error = err.includes("no git remote") || err.includes("no default remote") ? "No GitHub remote" : err.includes("auth") ? "gh is not logged in" : (list.stderr || "gh failed").trim().split("\n")[0];
          this.root = root; this.prs = []; return;
        }
        this.root = root; this.on = on; this.me = who; this.branch = branch.stdout.trim() || null;
        this.prs = JSON.parse(list.stdout || "[]").sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        this.error = null;
        // Shared state redraws every mod: write it only when it changes.
        const was = shared("ship-it.prs");
        if (was?.root !== root || (was?.on ?? null) !== (on ?? null) || was?.count !== this.prs.length) setShared("ship-it.prs", { root, on: on ?? null, count: this.prs.length });
      } catch (e) { if (this.key() === context) this.error = String(e); }
      finally { if (this.loading === started) this.loading = 0; cx.notify(); }
    });
  }

  shown() {
    const me = this.me;
    if (this.filter === "mine") return this.prs.filter((p) => p.author?.login === me);
    if (this.filter === "review") return this.prs.filter((p) => (p.reviewRequests ?? []).some((r) => r.login === me));
    return this.prs;
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
        .when(Boolean(review) && pr.reviewDecision !== "REVIEW_REQUIRED", (e) => e.child(div().flex_none().text_color(t[review.color]).child(review.label)))
        .child(div().flex_none().text_color(t.ansi2).child(`+${pr.additions}`))
        .child(div().flex_none().text_color(t.ansi1).child(`−${pr.deletions}`)));
  }

  render(cx) {
    if (this.shown() && (this.stale || this.key() !== this.context)) this.refresh(cx);
    const t = theme(), list = this.shown();
    const empty = this.error || (this.loading ? "Loading pull requests…" : this.filter === "all" ? "No open pull requests" : this.filter === "mine" ? "No open pull requests of yours" : "Nothing waiting for your review");
    return v_flex().id("ship-it-prs").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().whitespace_nowrap().child("Pull requests"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).whitespace_nowrap().child(`${this.prs.length} open`))
        .child(div().flex_1())
        .child(div().id("prs-refresh").size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Refresh")
          .on_click((_e, cx) => this.refresh(cx, true)).child(this.icon(this.loading ? "loader" : "refresh-cw", t.dim, 12))))
      .child(h_flex().flex_none().px(10).py(8).gap(4).border_b(1).border_color(t.border).children(FILTERS.map(([id, label]) => {
        const on = this.filter === id;
        return div().id(`prs-filter-${id}`).h(24).px(9).flex().items_center().rounded(6).cursor_pointer().text_size(12)
          .when(on, (e) => e.bg(t.selected).text_color(t.foreground)).when(!on, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
          .on_click((_e, cx) => { this.filter = id; cx.notify(); }).child(label);
      })))
      .child(v_flex().id("prs-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(2)
        .children(list.map((pr) => this.row(pr, t)))
        .when(!list.length, (e) => e.child(div().p(8).text_color(t.dim).child(empty))));
  }
}
