#!/usr/bin/env python3
"""From a macOS `sample` file of Herdr: the share of main-thread samples spent
in the quickjs-jit `ProductionBackend::maintenance` pass, and the share idle.

    /usr/bin/sample <pid> 5 -f herdr.sample
    scripts/perf/maintenance-share.py herdr.sample
"""
import re, sys

lines = open(sys.argv[1]).read().splitlines()
start = next(i for i, l in enumerate(lines) if "main-thread" in l)
end = next((i for i in range(start + 1, len(lines)) if re.match(r"^    \d+ Thread_", lines[i])), len(lines))
main = lines[start:end]
total = int(re.match(r"^\s*(\d+)", main[0]).group(1))
got, open_depth, idle = 0, None, 0
for l in main[1:]:
    m = re.match(r"^([ +!:|]*)(\d+) (.*)$", l)
    if not m: continue
    depth, n, name = len(m.group(1)), int(m.group(2)), m.group(3)
    if open_depth is not None and depth <= open_depth: open_depth = None
    if open_depth is None and "ProductionBackend::maintenance" in name:
        got += n; open_depth = depth
    if name.startswith("mach_msg2_trap"): idle += n
print(f"main thread {total} samples: maintenance {got} ({100 * got / total:.0f}%), idle {idle} ({100 * idle / total:.0f}%)")
