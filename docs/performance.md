# Performance: the Herdr window stalls

Notes from the investigation on 2026-10-31, so the work can start again
from here.

## The problem

Loading a new worktree felt slow, and while it loaded the whole Herdr
window stopped answering: clicks, terminals, the sidebar.

## What was measured

Herdr runs every mod's JavaScript in one QuickJS VM on the window's main
thread (`vendor/gpui-kit/crates/shell`), with the quickjs-jit compiler.
`exec` runs each program on its own thread, so git and gh never block the
window themselves.

| Herdr | Main thread in JIT maintenance | Main thread idle | Longest stall | Stalled (answers over 500 ms) |
| --- | --- | --- | --- | --- |
| 0.1.10, open for hours | 99% | 0% | 4,265 ms | 6.4 s in 30 s |
| Fork build (below), fresh | 1% | 93% | 48–77 ms | 0 |
| 0.1.10, fresh (control) | 0–1% | 82–86% | 49–88 ms | 0 |
| 0.1.10, fresh, after 15 mod reloads | 0% | 88% | 99 ms | 0 |

- In the slow window, a 5 s `sample` of the main thread had 3,405 of 3,433
  samples under `rquickjs_jit::ProductionBackend::maintenance`, reached from
  the per-call hooks (`record_hot`, `acquire_entry`) of every mod's
  `render` and promise jobs. The hot spot inside it is
  `FeedbackTable::snapshot`.
- Because the time is spent in maintenance, it lands in whatever script
  runs: the strip's `render` took 150 ms to 5.5 s, with the time spread over
  steps that cost nothing (a `cx.spawn`, `layout()`), and one review render
  took 13 s. `exec("sleep", ["1"])` took 5.9 s to resolve.
- **A restart clears it.** A fresh 0.1.10 is as fast as the fork build, so
  the cost builds up over hours of use. Reloading mods 15 times did not
  bring it back. What makes it build up is not known yet.

## The likely cause, in quickjs-jit

`vendor/quickjs-jit-runtime/src/lib.rs` in herdr-app:

- `maintenance_if_due` runs a full pass whenever the feedback version
  changes, and feedback changes on nearly every call while scripts run.
- A full pass, in its Tier-2 loop, copies the whole global feedback table
  (`self.feedback.snapshot(...)`) once per ready candidate. Each candidate's
  `Tier2ScanInputs` holds the feedback version, so the cache that should skip
  it never matches.
- Cost per call is then candidates × table size, and both grow with how much
  script the VM has seen.

Upstream already limited one caller (`0fa2b61`, "full upkeep only when due,
not on every promise job"); 0.1.10 has that and still stalled.

## What is done

- **Ship it** (this repo): lazy loading (hidden panels and panes do no
  work), redraws only on change, and a cache per repo and branch with the
  strip's PR shared as `ship-it.pr` (`99a594a`). This makes worktree
  switches show at once, but it can't fix a JIT that slows every script.
- **Herdr fork**: https://github.com/ashrodan/herdr-app, branch
  `fix/jit-maintenance-churn` (`2d4f845`). The per-call path starts at most
  one full maintenance pass per 200 ms (`MAINTENANCE_MIN_GAP`); test builds
  keep the old behaviour. It is not proven yet (see the table: fresh builds
  are fast with or without it). No upstream PR has been opened.

## Next steps

1. **Prove or drop the fork fix.** Use the fork build for a few hours (a
   day is better), then run the check below. If the slow 0.1.10 window
   reached 99% and the fork build stays near 1% with no stalls, open a draft
   PR to herdrdev/herdr-app with these numbers. If the fork build slows
   too, sample it again: the cause is elsewhere.
2. **Find what builds up.** Candidates: the number of functions the JIT
   tracks (every mod, Herdr's own `agents` mod with 21 agents re-renders on
   each status change), feedback entries never reclaimed, long-lived
   promise loops (`watchFolder`, `nextCommand`). Sampling a window at 1 h,
   3 h and 6 h and comparing the maintenance share would show the trend.
3. **If the fix holds, reduce the copies too.** Take the global feedback
   snapshot once per pass instead of once per candidate, and drop the
   feedback version from `Tier2ScanInputs` where it only blocks the cache.
4. **Ship it's own share.** Fewer renders and less script per render help
   whatever the JIT does: the review's Overview (markdown body,
   conversation) is the heaviest view.

## How to check

```sh
herdr-app ls                                       # two space ids, a and b
scripts/perf/run.sh before Herdr <space-a> <space-b>      # the installed app
scripts/perf/run.sh fork herdr-app <space-a> <space-b>    # a source build
```

`run.sh` switches between the two spaces for 30 s, times how long the
window takes to answer, and samples its main thread for 5 s
(`maintenance-share.py` reads the sample). A healthy window answers in
under 100 ms and spends a few percent in maintenance.

## Building the fork (macOS)

```sh
cd ~/dev/herdr-app
git submodule update --init --depth 1        # vendor/ghostty
# Zig 0.16.0 (CI's version) in .tools/, kept out of git via .git/info/exclude
ZIG=$PWD/.tools/zig-noxc cargo +1.95.0 build --release --locked
```

`.tools/zig-noxc` wraps Zig to pass `-Demit-xcframework=false`: without
the full Xcode, `/usr/bin/xcodebuild` is only a stub and Ghostty's
xcframework step fails. To run the build on the real setup, quit Herdr
(`herdr-app do app.quit`; terminals stay alive in herdr-core) and start
`target/release/herdr-app`. To go back, quit it and open Herdr.app. Never
start a bare build while the app is open: it opens a second window on the
same setup.

The vendored quickjs-jit crate's own tests don't build outside Herdr's
workspace (its test code uses an undeclared `rquickjs` crate); the library
builds.
