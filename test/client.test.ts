import { describe, expect, it } from "vitest";
import { IconifyError } from "../src/iconify/errors.js";
import { testClient } from "./helpers.js";

describe("IconifyClient", () => {
  it("searches, resolves aliases, and caches icon payloads", async () => {
    const { client, calls } = testClient();
    const search = await client.search({ query: "home", limit: 2 });
    expect(search.icons).toEqual(["test:home", "test:star"]);
    expect(search.collections.test?.license.spdx).toBe("MIT");

    const first = await client.getIcons(["test:house", "test:missing"]);
    expect(first.found[0]).toMatchObject({ id: "test:house", aliasOf: "home", monotone: true, width: 24 });
    expect(first.missing).toEqual(["test:missing"]);
    const after = calls();
    await client.getIcons(["test:house"]);
    expect(calls()).toBe(after);
  });

  it("retries a rate-limited icon fetch", async () => {
    const { client } = testClient({ failuresBeforeSuccess: 1, cache: false });
    const result = await client.getIcons(["test:home"]);
    expect(result.found.map((icon) => icon.id)).toEqual(["test:home"]);
  });

  it("reports a missing collection", async () => {
    const { client } = testClient();
    await expect(client.getCollection("nope")).rejects.toBeInstanceOf(IconifyError);
  });

  it("lists collections with license info", async () => {
    const { client } = testClient();
    const collections = await client.listCollections();
    expect(collections.test?.license.title).toBe("MIT");
    const infos = await client.getInfos(["test"]);
    expect(infos.get("test")?.author.name).toBe("Test Author");
  });
});
