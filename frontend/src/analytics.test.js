import test from "node:test";
import assert from "node:assert/strict";
import {businessTone, conversionRate, formatMetric, percentageChange, safeNumber, sortRows} from "./analytics.js";
import {collectPages} from "./pagination.js";
import {routes,pageFromPath,navigationItems} from "./navigation.js";

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
  assert.equal(formatMetric(null, "money"), "—");
  assert.equal(formatMetric(12000, "money", "UZS"), "UZS 12,000.00");
});

test("funnel konversiyasi va saralash", () => {
  assert.equal(conversionRate(25, 100), 25);
  assert.equal(conversionRate(10, 0), null);
  assert.deepEqual(sortRows([{leads: 2}, {leads: 8}], "leads", "desc").map(row => row.leads), [8, 2]);
});

test("API pagination includes every page and never silently truncates", async () => {
  const offsets=[];
  const result=await collectPages(async offset=>{offsets.push(offset);return offset===0 ? [1,2] : [3]},2);
  assert.deepEqual(result,[1,2,3]);
  assert.deepEqual(offsets,[0,2]);
  await assert.rejects(()=>collectPages(async()=>[1,2],2,2),/hajmi katta/);
});

test("existing routes resolve uniquely and superadmin navigation is absent",()=>{
  const paths=Object.values(routes).map(route=>route.path);
  assert.equal(new Set(paths).size,paths.length);
  for(const [key,route] of Object.entries(routes))assert.equal(pageFromPath(route.path),key);
  assert.equal(pageFromPath("/unknown"),"dashboard");
  for(const role of ["super_admin","tenant_admin","marketer","analyst","sales_manager"]){
    assert.ok(!navigationItems(role).some(item=>item.path==="/admin"));
    assert.ok(!navigationItems(role).some(item=>/mfactor/i.test(item.path+item.title)));
  }
  assert.ok(navigationItems("tenant_admin").some(item=>item.key==="team"));
  assert.ok(!navigationItems("sales_manager").some(item=>item.key==="crm"));
});
