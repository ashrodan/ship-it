#!/usr/bin/env python3
"""Switch the Herdr window between two spaces for 30 s and time how long
`herdr-app status` takes to answer: a stalled main thread shows as slow answers.

    scripts/perf/switch-test.py <label> <space-id-a> <space-id-b>

Space ids: `herdr-app ls`. It changes the space on screen while it runs.
"""
import statistics, subprocess, sys, time

label, a, b = sys.argv[1:4]
def select(space): subprocess.run(["herdr-app", "do", "space.select", "--id", space], capture_output=True)
lat, start, plan, k = [], time.time(), [(3, a), (10, b), (17, a), (24, b)], 0
while time.time() - start < 31:
    if k < len(plan) and time.time() - start >= plan[k][0]:
        select(plan[k][1]); k += 1
    t = time.time(); subprocess.run(["herdr-app", "status"], capture_output=True); lat.append((time.time() - t) * 1000)
    time.sleep(0.3)
lat.sort()
print(f"{label} n {len(lat)} median {statistics.median(lat):.0f} ms, p90 {lat[int(len(lat) * .9)]:.0f} ms, "
      f"max {lat[-1]:.0f} ms, stalled (answers over 500 ms) {sum(x for x in lat if x > 500):.0f} ms")
