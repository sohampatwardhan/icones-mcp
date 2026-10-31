import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/** Inter is bundled so contact-sheet labels render without system fonts. */
export function interFontPath(): string {
  if (cached && existsSync(cached)) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../assets/fonts/Inter-Regular.ttf"),
    join(here, "../../../assets/fonts/Inter-Regular.ttf"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cached = candidate;
      return candidate;
    }
  }
  throw new Error(
    "The bundled Inter font is missing (assets/fonts/Inter-Regular.ttf). Reinstall icones-mcp.",
  );
}
