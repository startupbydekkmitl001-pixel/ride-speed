import test from "node:test";
import assert from "node:assert/strict";
import {
  blankVehicleDraft,
  draftFromVehicle,
  draftFromCatalog,
  buildGarageVehicle,
  vehicleDisplayName,
  vehicleMeasure,
} from "../src/features/garage/model.ts";
test("editing preserves owner specification, identity and private photo without consulting newer catalog facts", () => {
  const owned = {
    id: "owned",
    catalogId: "honda-pcx160-th",
    category: "scooter",
    brand: "Honda",
    model: "PCX160",
    engineCc: 156.9,
    powertrain: "petrol",
    year: "",
    photoPath: "owner/avatar.jpg",
    nickname: "Daily",
  };
  const result = buildGarageVehicle(
    { ...draftFromVehicle(owned), nickname: "Work" },
    "unused",
    2026,
    owned,
  );
  assert.equal(result.error, null);
  assert.equal(result.vehicle.id, "owned");
  assert.equal(result.vehicle.engineCc, 156.9);
  assert.equal(result.vehicle.photoPath, "owner/avatar.jpg");
  assert.equal(result.vehicle.nickname, "Work");
  assert.equal(owned.nickname, "Daily");
});
test("a removed editor target cannot be recreated, and a changed private photo is merged from the current vehicle", () => {
  const old = {
    id: "owned",
    catalogId: null,
    category: "scooter",
    brand: "Honda",
    model: "PCX160",
    engineCc: 156.9,
    year: "",
    photoPath: "owner/old.jpg",
  };
  const draft = draftFromVehicle(old);
  const deleted = buildGarageVehicle(draft, "new", 2026, old, []);
  assert.equal(deleted.vehicle, null);
  assert.equal(deleted.error, "m3.error.vehicleChanged");
  const updated = buildGarageVehicle(draft, "new", 2026, old, [
    { ...old, photoPath: "owner/new.jpg" },
  ]);
  assert.equal(updated.vehicle.photoPath, "owner/new.jpg");
  assert.equal(updated.vehicle.engineCc, 156.9);
});
test("a model selection does not infer the owner year, and a custom Civic RS keeps its unknown configuration", () => {
  assert.equal(
    draftFromCatalog({
      id: "verified",
      category: "scooter",
      brand: "Honda",
      model: "PCX160",
      engineCc: 156.93,
      powertrain: "petrol",
      modelYear: "2026",
    }).year,
    "",
  );
  const draft = {
    ...blankVehicleDraft("car"),
    brand: "Honda",
    model: "Civic RS",
  };
  const result = buildGarageVehicle(draft, "custom", 2026);
  assert.equal(result.vehicle.catalogId, null);
  assert.equal(result.vehicle.engineCc, null);
  assert.equal(result.vehicle.powertrain, null);
  assert.equal(result.vehicle.year, "");
});
test("electric drafts store motor kW instead of cc while hybrids retain manufacturer displacement", () => {
  const ev = {
    ...blankVehicleDraft("car"),
    brand: "BYD",
    model: "DOLPHIN",
    powertrain: "electric",
    engineCcInput: "999",
    motorPowerKwInput: "70",
  };
  assert.equal(buildGarageVehicle(ev, "ev", 2026).vehicle.engineCc, null);
  assert.equal(buildGarageVehicle(ev, "ev", 2026).vehicle.motorPowerKw, 70);
  assert.deepEqual(
    vehicleMeasure({
      engineCc: null,
      motorPowerKw: 70,
      powertrain: "electric",
    }),
    { value: 70, unit: "kw" },
  );
  assert.deepEqual(
    vehicleMeasure({
      engineCc: 1498,
      motorPowerKw: null,
      powertrain: "hybrid",
    }),
    { value: 1498, unit: "cc" },
  );
});
test("draft validation rejects malformed specs, unsafe photo-like color text and impossible years but allows unknown fields", () => {
  const base = {
    ...blankVehicleDraft("scooter"),
    brand: "Honda",
    model: "Custom",
  };
  assert.equal(
    buildGarageVehicle({ ...base, engineCcInput: "1e3" }, "id", 2026).error,
    "m3.validation.spec",
  );
  assert.equal(
    buildGarageVehicle({ ...base, engineCcInput: "10001" }, "id", 2026).error,
    "m3.validation.spec",
  );
  assert.equal(
    buildGarageVehicle(
      { ...base, powertrain: "electric", motorPowerKwInput: "2001" },
      "id",
      2026,
    ).error,
    "m3.validation.spec",
  );
  assert.equal(
    buildGarageVehicle({ ...base, model: "Custom\u0000" }, "id", 2026).error,
    "m3.validation.name",
  );
  assert.equal(
    buildGarageVehicle({ ...base, year: "1800" }, "id", 2026).error,
    "m3.validation.year",
  );
  assert.equal(
    buildGarageVehicle({ ...base, year: "2568" }, "id", 2026).error,
    null,
  );
  assert.equal(
    buildGarageVehicle({ ...base, color: "url(x)" }, "id", 2026).error,
    "m3.validation.color",
  );
  assert.equal(
    buildGarageVehicle({ ...base, color: "#ff5a1f" }, "id", 2026).vehicle.color,
    "#FF5A1F",
  );
  assert.equal(
    buildGarageVehicle({ ...base, engineCcInput: "1,299" }, "id", 2026).vehicle
      .engineCc,
    1299,
  );
  assert.equal(
    vehicleDisplayName({
      brand: "Honda",
      model: "PCX160",
      nickname: "Commute",
    }),
    "Commute",
  );
});
