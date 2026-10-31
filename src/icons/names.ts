import { IconifyError } from "../iconify/errors.js";

const ICON_PART = /^[a-z0-9][a-z0-9_.-]*$/i;

export interface ParsedIconId {
  prefix: string;
  name: string;
  id: string;
}

export function parseIconId(input: string): ParsedIconId {
  const trimmed = input.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1 || trimmed.includes(":", colon + 1)) {
    throw new IconifyError(
      `Icon id "${input}" must look like "prefix:name", for example "lucide:house".`,
      "invalid",
    );
  }
  const prefix = trimmed.slice(0, colon);
  const name = trimmed.slice(colon + 1);
  assertIconPart(prefix, "prefix", input);
  assertIconPart(name, "name", input);
  return { prefix, name, id: `${prefix}:${name}` };
}

export function parseIconIds(inputs: readonly string[], max: number): string[] {
  if (inputs.length === 0) {
    throw new IconifyError("Pass at least one icon id, such as \"lucide:house\".", "invalid");
  }
  if (inputs.length > max) {
    throw new IconifyError(`At most ${max} icons can be rendered at once.`, "invalid");
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const input of inputs) {
    const parsed = parseIconId(input);
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    ids.push(parsed.id);
  }
  return ids;
}

export function assertPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  assertIconPart(trimmed, "prefix", prefix);
  return trimmed;
}

export function collectionPageUrl(prefix: string): string {
  return `https://icones.js.org/collection/${prefix}`;
}

/** Opens the icon on Icônes. The `icon` query is the full Iconify id. */
export function iconPageUrl(prefix: string, name: string): string {
  return `https://icones.js.org/collection/${prefix}?icon=${prefix}:${name}`;
}

function assertIconPart(value: string, kind: "prefix" | "name", original: string): void {
  if (!ICON_PART.test(value) || value.length > 128) {
    throw new IconifyError(
      `Icon ${kind} in "${original}" can only contain letters, numbers, ".", "_" and "-".`,
      "invalid",
    );
  }
}
