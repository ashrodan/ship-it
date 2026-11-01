// Resolves "herdr" to the stand-in, and loads the mods' .js files as ES
// modules (the repo has no package.json to say so).
const HERDR = new URL("./herdr.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "herdr") return { url: HERDR, shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.includes("/mods/") && url.endsWith(".js")) return next(url, { ...context, format: "module" });
  return next(url, context);
}
