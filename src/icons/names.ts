/**
 * Iconify id parsing and Icônes page URLs.
 */

import { IconifyError } from "../iconify/errors.js";

/**
 * A prefix or name: starts with a letter or digit, then letters, digits, `.`, `_`, or `-`.
 *
 * @remarks
 * The length check is separate. A part longer than 128 characters is rejected
 * even when it matches this pattern.
 */
const ICON_PART = /^[a-z0-9][a-z0-9_.-]*$/i;

/**
 * A validated `prefix:name` id.
 */
export interface ParsedIconId {
  /**
   * Collection prefix.
   */
  prefix: string;

  /**
   * Icon name within the collection.
   */
  name: string;

  /**
   * Canonical id, `prefix` + `:` + `name`, after trimming.
   */
  id: string;
}

/**
 * Parses one Iconify id.
 *
 * @param input - Raw id, possibly surrounded by whitespace. Exactly one colon
 * is required, and both sides must be non-empty.
 * @returns The prefix, name, and canonical id.
 * @throws {@link IconifyError} with code `invalid` when the id is missing a
 * colon, has more than one colon, or contains a character outside the allowed set.
 *
 * @example
 *
 * ```ts
 * parseIconId(" lucide:house ");
 * // { prefix: "lucide", name: "house", id: "lucide:house" }
 * ```
 */
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

/**
 * Parses a list of icon ids, dropping duplicates and preserving the first occurrence.
 *
 * @param inputs - Raw ids.
 * @param max - Maximum number of inputs before deduplication.
 * @returns Canonical ids.
 * @throws {@link IconifyError} with code `invalid` when the list is empty,
 * longer than `max`, or contains an id {@link parseIconId} rejects.
 */
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

/**
 * Validates a collection prefix used as a filter or resource parameter.
 *
 * @param prefix - Raw prefix.
 * @returns The trimmed prefix.
 * @throws {@link IconifyError} when the prefix is empty or contains characters
 * outside letters, digits, `.`, `_`, and `-`.
 */
export function assertPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  assertIconPart(trimmed, "prefix", prefix);
  return trimmed;
}

/**
 * Builds the Icônes page URL for a whole collection.
 *
 * @param prefix - Collection prefix, already validated by the caller.
 * @returns An `https://icones.js.org/collection/...` URL.
 */
export function collectionPageUrl(prefix: string): string {
  return `https://icones.js.org/collection/${prefix}`;
}

/**
 * Builds the Icônes page URL that opens one icon.
 *
 * The `icon` query is the full Iconify id.
 *
 * @param prefix - Collection prefix.
 * @param name - Icon name.
 * @returns An `https://icones.js.org/collection/prefix?icon=prefix:name` URL.
 */
export function iconPageUrl(prefix: string, name: string): string {
  return `https://icones.js.org/collection/${prefix}?icon=${prefix}:${name}`;
}

/**
 * Rejects a prefix or name that could not be a single URL path segment.
 *
 * @param value - The prefix or name after the id has been split.
 * @param kind - Which side failed, included in the error text.
 * @param original - The caller's original string, included in the error text.
 * @throws {@link IconifyError} with code `invalid` when `value` fails
 * {@link ICON_PART} or is longer than 128 characters.
 */
function assertIconPart(value: string, kind: "prefix" | "name", original: string): void {
  if (!ICON_PART.test(value) || value.length > 128) {
    throw new IconifyError(
      `Icon ${kind} in "${original}" can only contain letters, numbers, ".", "_" and "-".`,
      "invalid",
    );
  }
}
