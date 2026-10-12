import test from "node:test";
import assert from "node:assert/strict";
import {businessTone, conversionRate, formatMetric, percentageChange, safeNumber, sortRows} from "./analytics.js";

test("foiz o'zgarishi to'g'ri hisoblanadi", () => {
  assert.equal(percentageChange(118.7, 100), 18.7);
  assert.equal(percentageChange(96.9, 100), -3.1);
  assert.equal(percentageChange(10, 0), null);
  assert.equal(percentageChange(0, 0), 0);
  assert.equal(percentageChange(10, undefined), null);
});

test("biznes indikatori CPL uchun teskari ishlaydi", () => {
  assert.equal(businessTone("cpl", -12), "positive");
  assert.equal(businessTone("cpl", 12), "negative");
  assert.equal(businessTone("sales", -3), "negative");
  assert.equal(businessTone("spend", 20), "neutral");
});

test("NaN va Infinity UI ga chiqmaydi", () => {
  assert.equal(safeNumber(Number.NaN), 0);
  assert.equal(safeNumber(Infinity), 0);
  assert.equal(formatMetric(undefined, "percent"), "0,0%");
});

test("funnel konversiyasi va saralash", () => {
  assert.equal(conversionRate(25, 100), 25);
  assert.equal(conversionRate(10, 0), null);
  assert.deepEqual(sortRows([{leads: 2}, {leads: 8}], "leads", "desc").map(row => row.leads), [8, 2]);
});
