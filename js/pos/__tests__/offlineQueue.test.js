const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

// Minimal localStorage polyfill for Node
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

const queue = require("../offlineQueue.js");

describe("offlineQueue.js", () => {
  before(async () => {
    await queue._reset();
  });

  it("enqueues and peeks via LS fallback when IndexedDB unavailable", async () => {
    await queue._reset();
    const n = await queue.enqueue({ type: "settle", bill: { billId: "b1" } });
    assert.equal(n, 1);
    const all = await queue.peek();
    assert.equal(all.length, 1);
    assert.equal(all[0].bill.billId, "b1");
    assert.ok(all[0].id);
  });

  it("setAll replaces queue", async () => {
    await queue.setAll([{ id: "a", type: "settle" }, { id: "b", type: "settle" }]);
    assert.equal((await queue.peek()).length, 2);
    await queue.setAll([]);
    assert.equal((await queue.peek()).length, 0);
  });
});
