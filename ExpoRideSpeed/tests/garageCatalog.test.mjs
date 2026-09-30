import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function loadCatalog() {
  const source = fs.readFileSync(
    new URL("../src/data/vehicleCatalog.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      assert.equal(name, "./vehicleCatalog.json");
      return JSON.parse(
        fs.readFileSync(
          new URL("../src/data/vehicleCatalog.json", import.meta.url),
          "utf8",
        ),
      );
    },
  });
  return exports;
}
const catalog = loadCatalog();
test("each category offers at least twenty distinct families without counting trim duplicates", () => {
  for (const category of ["scooter", "bigbike", "car"]) {
    const entries = catalog.searchVehicles("", { category });
    assert.ok(new Set(entries.map((entry) => entry.familyId)).size >= 20);
  }
});
test("search combines filters while handling compact model aliases and keeping maxi scooters classified by type", () => {
  assert.equal(
    catalog.searchVehicles("S1000RR", { category: "bigbike", brand: "BMW" })
      .length,
    1,
  );
  assert.equal(
    catalog.searchVehicles("S1000RR", { category: "scooter" }).length,
    0,
  );
  assert.equal(catalog.searchVehicles("Forza350")[0].category, "scooter");
  assert.equal(catalog.searchVehicles("VStromSX")[0].category, "bigbike");
});
test("published precision and explicit EV variants survive legacy lookup without rewriting owner snapshots", () => {
  const owned = { catalogId: "honda-pcx160-th", engineCc: 156.9, year: "" };
  assert.equal(catalog.getCatalogVehicle(owned.catalogId).engineCc, 156.93);
  assert.equal(owned.engineCc, 156.9);
  assert.equal(
    catalog.getCatalogVehicle("bmw-s1000rr-th").modelYear,
    undefined,
  );
  assert.equal(
    catalog.getCatalogVehicle("honda-city-ehev-rs-th").engineCc,
    1498,
  );
  const dolphin = catalog.searchVehicles("DOLPHIN");
  assert.deepEqual(
    dolphin.map((entry) => entry.motorPowerKw).sort((a, b) => a - b),
    [70, 150],
  );
  assert.ok(
    dolphin.every(
      (entry) => entry.engineCc === null && entry.powertrain === "electric",
    ),
  );
});
test("catalog provenance is field-specific and ambiguous or unverified legacy entries remain distinct", () => {
  assert.equal(
    catalog.USER_GARAGE_SUGGESTIONS.find((entry) => entry.label === "Civic RS")
      .catalogId,
    null,
  );
  assert.equal(
    catalog.getCatalogVehicle("tesla-model3-th").specVerified,
    false,
  );
  assert.equal(catalog.getCatalogVehicle("tesla-model3-th").motorPowerKw, null);
  assert.equal(catalog.searchVehicles("Z500")[0].modelYear, undefined);
  assert.ok(
    catalog.VEHICLE_CATALOG.every((entry) =>
      entry.sourceUrl.startsWith("https://"),
    ),
  );
});
