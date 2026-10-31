/**
 * Locates the bundled Inter font used for contact-sheet labels.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Last path that was found, so later rasters skip the filesystem walk.
 */
let cached: string | undefined;

/**
 * Resolves the bundled Inter Regular font file.
 *
 * Inter is bundled so contact-sheet labels render without system fonts.
 * Rasterized labels are pixels. The font file itself stays under the SIL Open
 * Font License in `assets/fonts/OFL.txt`.
 *
 * @returns Absolute path to `Inter-Regular.ttf`.
 * @throws Error when the font is missing from both candidate locations. That
 * happens if the package was installed without `assets/fonts`.
 *
 * @remarks
 * The candidates cover `src/render` during tests (via tsx) and `dist/render`
 * after `tsc`, which sit at different depths from the repository root.
 */
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
