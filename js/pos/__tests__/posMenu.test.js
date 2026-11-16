const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const menu = require("../posMenu.js");

describe("posMenu variants", () => {
  it("groups weight variants under one base", () => {
    menu.loadFromArray([
      { id: "1", name: "Regular Bhaji (500 gms)", nameHi: "भाजी", price: 180, category: "Bhaji", available: true },
      { id: "2", name: "Regular Bhaji (1 kg)", nameHi: "भाजी", price: 350, category: "Bhaji", available: true },
      { id: "3", name: "Butter Dabeli", nameHi: "बटर दाबेली", price: 40, category: "Snacks", available: true }
    ]);
    const groups = menu.getGroups();
    const bhaji = groups.find((g) => g.baseName === "Regular Bhaji");
    assert.ok(bhaji);
    assert.equal(bhaji.variants.length, 2);
    assert.equal(bhaji.hasVariants, true);
    assert.equal(bhaji.minPrice, 180);
    const dabeli = groups.find((g) => g.baseName === "Butter Dabeli");
    assert.ok(dabeli);
    assert.equal(dabeli.variants.length, 1);
  });

  it("exposes default addons", () => {
    assert.ok(menu.DEFAULT_ADDONS.length >= 3);
  });
});
