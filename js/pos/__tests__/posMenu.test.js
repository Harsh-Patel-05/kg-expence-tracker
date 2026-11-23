const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const menu = require("../posMenu.js");

describe("posMenu variants", () => {
  it("groups weight variants under one base", () => {
    menu.loadFromArray([
      { id: "1", name: "Regular Bhaji (500 gms)", nameHi: "भाजी", price: 180, category: "Bhaji", available: true },
      { id: "2", name: "Regular Bhaji (1 kg)", nameHi: "भाजी", price: 350, category: "Bhaji", available: true },
      { id: "3", name: "Butter Pau (6)", nameHi: "बटर पाव", price: 50, category: "Mains", available: true }
    ]);
    const groups = menu.getGroups();
    const bhaji = groups.find((g) => g.baseName === "Regular Bhaji");
    assert.ok(bhaji);
    assert.equal(bhaji.variants.length, 2);
    assert.equal(bhaji.hasVariants, true);
    assert.equal(bhaji.minPrice, 180);
    assert.equal(bhaji.variants[0].__variantLabel, "500 ग्राम");
    assert.equal(bhaji.variants[1].__variantLabel, "1 किलो");
    const pau = groups.find((g) => g.baseName === "Butter Pau");
    assert.ok(pau);
    assert.equal(pau.variants.length, 1);
  });

  it("exposes default addons only for bhaji-style items", () => {
    assert.ok(menu.DEFAULT_ADDONS.length >= 3);
    menu.loadFromArray([
      { id: "c1", name: "Paneer Chilli Dry", price: 170, category: "Chinese", available: true },
      { id: "b1", name: "Regular Bhaji (500 g)", price: 120, category: "Mains", available: true }
    ]);
    const chilli = menu.getGroups().find((g) => g.baseName === "Paneer Chilli Dry");
    const bhaji = menu.getGroups().find((g) => g.baseName === "Regular Bhaji");
    assert.ok(chilli);
    assert.equal((chilli.addons || []).length, 0);
    assert.ok(bhaji);
    assert.ok((bhaji.addons || []).length >= 3);
  });

  it("merges Chinese Bhel plate + on-kilo into one card with 1 / 1 Kg", () => {
    menu.loadFromArray([
      { id: "a", name: "Chinese Bhel", price: 160, category: "Chinese", available: true },
      { id: "b", name: "Chinese Bhel — Chinese on Kilo (500 g)", price: 160, category: "Chinese", available: true },
      { id: "c", name: "Chinese Bhel — Chinese on Kilo (1 kg)", price: 300, category: "Chinese", available: true }
    ]);
    const groups = menu.getGroups().filter((g) => /chinese bhel/i.test(g.baseName));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].baseName, "Chinese Bhel");
    assert.equal(groups[0].variants.length, 2);
    const labels = groups[0].variants.map((v) => v.__variantLabel).sort();
    assert.deepEqual(labels, ["1 किलो", "500 ग्राम"]);
  });

  it("strips Chinese on Kilo / किलो पर चाइनीज from base names", () => {
    menu.loadFromArray([
      {
        id: "m1",
        name: "Manchurian Dry — Chinese on Kilo (500 g)",
        nameHi: "मंचूरियन ड्राई — किलो पर चाइनीज",
        price: 160,
        category: "Chinese",
        available: true
      }
    ]);
    const g = menu.getGroups()[0];
    assert.equal(g.baseName, "Manchurian Dry");
    assert.equal(g.variants[0].__variantLabel, "500 ग्राम");
    assert.ok(!/chinese on kilo/i.test(g.variants[0].__base || ""));
  });

  it("formats merged weights as Hindi किलो", () => {
    assert.equal(menu.formatWeightLabel(1500), "1.5 किलो");
    assert.equal(menu.weightGramsFromLabel("500 g"), 500);
    assert.equal(menu.weightGramsFromLabel("1 kg"), 1000);
    assert.equal(menu.weightGramsFromLabel("1.5 किलो"), 1500);
  });

  it("excludes Snacks from POS categories and search", () => {
    menu.loadFromArray([
      { id: "1", name: "Regular Bhaji (500 gms)", price: 180, category: "Bhaji", available: true },
      { id: "3", name: "Butter Dabeli", price: 40, category: "Snacks", available: true },
      { id: "4", name: "Vada Pav", price: 30, category: "Snacks", available: true }
    ]);
    const cats = menu.categories().map((c) => c.name);
    assert.ok(!cats.includes("Snacks"));
    assert.equal(menu.getGroups().length, 1);
    assert.equal(menu.search("", "all").length, 1);
  });

  it("renders size chips inside multi-variant cards", () => {
    menu.loadFromArray([
      { id: "1", name: "Regular Bhaji (500 gms)", price: 180, category: "Bhaji", available: true },
      { id: "2", name: "Regular Bhaji (1 kg)", price: 350, category: "Bhaji", available: true }
    ]);
    const el = { innerHTML: "", insertAdjacentHTML() {} };
    menu.renderGrid(el, menu.getGroups(), { pageSize: 50 });
    assert.match(el.innerHTML, /kg-pos-sizes/);
    assert.match(el.innerHTML, /data-size-id="1"/);
    assert.match(el.innerHTML, /data-size-id="2"/);
    assert.match(el.innerHTML, /500 ग्राम/);
    assert.match(el.innerHTML, /1 किलो/);
  });

  it("renders size chips for Chinese on-kilo groups", () => {
    menu.loadFromArray([
      { id: "a", name: "Chinese Bhel", price: 160, category: "Chinese", available: true },
      { id: "b", name: "Chinese Bhel — Chinese on Kilo (500 g)", price: 160, category: "Chinese", available: true },
      { id: "c", name: "Chinese Bhel — Chinese on Kilo (1 kg)", price: 300, category: "Chinese", available: true }
    ]);
    const el = { innerHTML: "", insertAdjacentHTML() {} };
    menu.renderGrid(el, menu.getGroups(), { pageSize: 50 });
    assert.match(el.innerHTML, /kg-pos-sizes/);
    assert.match(el.innerHTML, /500 ग्राम/);
    assert.match(el.innerHTML, /1 किलो/);
    assert.doesNotMatch(el.innerHTML, /kg-pos-add-btn/);
  });
});
