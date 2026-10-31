import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/iconify/cache.js";
import { RequestGate } from "../src/iconify/gate.js";

describe("TtlCache", () => {
  it("expires entries and evicts the oldest", () => {
    let now = 1_000;
    const cache = new TtlCache<string>(2, () => now);
    cache.set("a", "one", 50);
    cache.set("b", "two", 50);
    expect(cache.get("a")).toBe("one");
    cache.set("c", "three", 50);
    expect(cache.get("b")).toBeUndefined();
    now = 1_060;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
  });

  it("does not store zero TTLs", () => {
    const cache = new TtlCache<string>(10);
    cache.set("a", "one", 0);
    expect(cache.size).toBe(0);
  });
});

describe("RequestGate", () => {
  it("waits between acquires", async () => {
    let now = 0;
    const waits: number[] = [];
    const gate = new RequestGate(
      25,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      () => now,
    );
    await gate.acquire();
    await gate.acquire();
    await gate.acquire();
    expect(waits).toEqual([25, 25]);
  });
});
