// A stand-in for Herdr's "herdr" module, so the mods' logic runs under plain
// Node (test/register.mjs maps the import here). exec runs real programs;
// spaces, panes and layout come from `state`, and run() records its calls.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export const state = { spaces: [], panes: [], layout: null, shared: {}, runs: [] };

export function exec(program, args = [], { cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(program, args, { cwd, maxBuffer: 64 << 20 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") return reject(error);
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

export const readTextFile = (path) => readFile(path, "utf8");
export const home = () => process.env.HOME;
export const spaces = () => state.spaces;
export const panes = () => state.panes;
export const focused = () => null;
export const layout = () => state.layout;
export const shared = (key) => state.shared[key];
export const setShared = (key, value) => { state.shared[key] = value; };
export const run = (command, args) => { state.runs.push([command, args]); };
export const notify = () => {};
