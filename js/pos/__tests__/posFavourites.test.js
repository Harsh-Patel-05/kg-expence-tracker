const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Minimal localStorage for Node
const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => {
    mem[k] = String(v);
  },
  removeItem: (k) => {
    delete mem[k];
  }
};

const menu = require("../posMenu.js");
const fav = require("../posFavourites.js");

describe("posFavourites", () => {
  it("records bills and surfaces favourites + hotshots", () => {
    menu.loadFromArray([
      { id: "1", name: "Regular Bhaji (500 gms)", price: 180, category: "Bhaji", available: true },
      { id: "2", name: "Regular Bhaji (1 kg)", price: 350, category: "Bhaji", available: true },
      { id: "9", name: "Dal Fry (500 g)", price: 230, category: "Punjabi", available: true }
    ]);
    fav.recordBillItems(
      [
        { menuItemId: "1", name: "Regular Bhaji (500 gms)", qty: 3 },
        { menuItemId: "9", name: "Dal Fry (500 g)", qty: 1 }
      ],
      Date.now()
    );
    fav.recordBillItems([{ menuItemId: "1", name: "Regular Bhaji (500 gms)", qty: 2 }], Date.now());
    const favourites = fav.getFavourites(10);
    assert.ok(favourites.length >= 1);
    assert.equal(favourites[0].baseName, "Regular Bhaji");
    const hot = fav.getHotshots(10);
    assert.ok(hot.some((g) => g.baseName === "Regular Bhaji"));
    const key = favourites[0].key;
    assert.equal(fav.removeFavourite(key), true);
    assert.ok(!fav.getFavourites(10).some((g) => g.key === key));
  });
});
