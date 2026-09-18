"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSyntheticPatient } = require("../workshop-smoke.cjs");

test("buildSyntheticPatient zawiera kontakt (telefon albo e-mail) wymagany przez API", () => {
  const patient = buildSyntheticPatient("90011512345");
  assert.ok(
    patient.phone || patient.email,
    "buildSyntheticPatient musi ustawiać phone albo email, inaczej API odrzuci pacjenta z CONTACT_REQUIRED."
  );
});

test("buildSyntheticPatient nie używa adresu, który mógłby być prawdziwy", () => {
  const patient = buildSyntheticPatient("90011512345");
  if (patient.email) {
    assert.match(patient.email, /\.invalid$/);
  }
});
