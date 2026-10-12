import {test, expect} from "@playwright/test";

async function session(page, role="tenant_admin", populated=false) {
  const calls=[];
  let connections=[];
  await page.route("**/api-proxy/**", async route=>{
    const request=route.request(), path=new URL(request.url()).pathname.replace("/api-proxy", "");
    calls.push({path,method:request.method(),body:request.postData() ? request.postDataJSON() : null});
    let body;
    if(path==="/api/auth/refresh") body={access_token:"test-session",role,tenant_id:1,full_name:"UI Test User",email:"ui@example.invalid"};
    else if(path==="/api/analytics/summary") body=populated ? {spend:100,leads:10,cpl:10,ctr:2,sales:0,roas:0,impressions:1000,clicks:20,qualified:null,currency:"USD",kpis:{},daily_activity:[{date:"2026-10-01",spend:100,leads:10,cpl:10,clicks:20}],platforms:[{platform:"facebook",leads:10,sales:0}],top_campaigns:[{name:"Test campaign",leads:10}],funnel_rates:{clicks:2,leads:50}} : {spend:null,leads:null,cpl:null,ctr:null,sales:null,roas:null,currency:"unknown",previous:null,kpis:{},daily_activity:[],platforms:[],top_campaigns:[],funnel_rates:{}};
    else if(path==="/api/analytics/campaigns" && populated) body=[{id:1,name:"Test campaign",platform:"facebook",date:"2026-10-01",spend:100,impressions:1000,clicks:20,ctr:2,leads:10,cpl:10,sales:0,roas:0,currency:"USD"}];
    else if(["/api/analytics/campaigns","/api/leads","/api/users","/api/admin/tenants"].includes(path) || path.endsWith("/users")) body=[];
    else if(path==="/api/admin/summary") body={total_clients:0};
    else if(path==="/api/business/summary") body={records:0,crm:{leads:0,deals:0,stages:{}},sales:{won:0,revenue_by_currency:{}},employees:{count:0,assigned_deals_by_user_id:{}},calls:{total:0,answered:0,unanswered:0,talk_seconds:0}};
    else if(path==="/api/business/plans") body={month:"2026-10",plans:[]};
    else if(path==="/api/integrations") body=connections;
    else if(path==="/api/integrations/meta" && request.method()==="POST") {connections=[{provider:"meta",status:"configured",synced_records:0}];body=connections[0];}
    else if(path==="/api/ai/status") body={configured:true,read_only:true};
    else if(path==="/api/ai/chat") body={answer:"Browser test response",tools_used:["marketing_summary"],read_only:true};
    else throw new Error(`Unexpected test API: ${path}`);
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  return calls;
}
async function layout(page) {
  await expect(page.locator("header")).toHaveCount(1);
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator('nav a[href="/admin"]')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
}
for(const width of [1440,768,390,320]) {
  test(`Existing routes and responsive layout at ${width}px`,async ({page})=>{
    await page.setViewportSize({width,height:900});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await session(page);await page.goto("/dashboard");
    await expect(page.locator("h1")).toHaveText("Marketing tahlili");
    for(const [path,title] of [["/crm","CRM va sotuvlar"],["/employees","Xodimlar"],["/calls","Qo'ng'iroqlar"],["/plans","Plan / Fakt"],["/ai-advisor","AI Agent"],["/settings","Sozlamalar"],["/team","Jamoa"],["/dashboard","Marketing tahlili"]]) {
      if(width<=760) await page.locator("header button").click();
      await page.locator(`nav a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(path+"$"));
      await expect(page.locator("h1")).toHaveText(title);
      await expect(page.locator('main [role="status"]')).toHaveCount(0);
      await layout(page);
    }
    await expect(page.locator(".kpi-value").first()).toContainText("Ma'lumot yo'q");
    await page.screenshot({path:`test-results/dashboard-${width}.png`,fullPage:true});
    expect(errors).toEqual([]);
  });
}
test("Direct admin route retains permissions without navigation entry",async ({page})=>{
  await session(page,"super_admin");await page.goto("/admin");
  await expect(page.locator("h1")).toHaveText("Umumiy tahlil");await layout(page);
  await expect(page.getByRole("heading",{name:"Mijozlar",exact:true})).toBeVisible();
});
test("Settings and AI retain their API contracts",async ({page})=>{
  const calls=await session(page);await page.goto("/settings");
  await page.getByRole("button",{name:"Meta Ads",exact:true}).click();
  await page.getByLabel("Ad account (act_123)",{exact:true}).fill("act_123");
  await page.getByLabel("Access token",{exact:true}).fill("browser-test-token");
  await page.getByRole("button",{name:"Shifrlab saqlash / kalitni yangilash"}).click();
  await expect(page.getByText("Saqlangan, tekshirilmagan",{exact:true})).toBeVisible();
  expect(calls.find(c=>c.path==="/api/integrations/meta").body).toEqual({credentials:{ad_account_id:"act_123",access_token:"browser-test-token"}});
  await expect(page.getByLabel("Access token",{exact:true})).toHaveValue("");
  await page.getByRole("button",{name:"Kunduzgi rejim",exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:"test-results/settings-light.png",fullPage:true});
  await page.locator('nav a[href="/ai-advisor"]').click();
  await page.getByLabel("Savolingiz",{exact:true}).fill("Test-only question");
  await page.getByRole("button",{name:"Tahlil qilish",exact:true}).click();
  await expect(page.getByText("Browser test response",{exact:true})).toBeVisible();
  expect(calls.find(c=>c.path==="/api/ai/chat").body).toEqual({message:"Test-only question"});
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain("browser-test-token");
});
test("Mobile drawer closes on Escape and browser back preserves route",async ({page})=>{
  await page.setViewportSize({width:390,height:844});await session(page);await page.goto("/dashboard");
  const toggle=page.locator("header button");await toggle.click();await expect(page.locator("aside")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.locator("aside")).toBeHidden();await expect(toggle).toBeFocused();
  await toggle.click();await page.locator('nav a[href="/settings"]').click();await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();await expect(page.locator("h1")).toHaveText("Marketing tahlili");
});
test("Campaign hash scroll works when already on dashboard",async ({page})=>{
  await session(page);await page.goto("/dashboard");
  await expect(page.locator(".kpi-value").first()).toBeVisible();
  await page.locator('nav a[href="/dashboard#campaigns"]').click();
  await expect(page).toHaveURL(/#campaigns$/);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
});
test("Charts, campaign search, filters and CSV export retain existing behavior",async ({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await session(page,"tenant_admin",true);await page.goto("/dashboard");
  await expect(page.locator(".chart-area .recharts-wrapper")).toHaveCount(4);
  await expect(page.locator("#campaigns tbody tr")).toHaveCount(1);
  await page.getByPlaceholder("Kampaniya qidirish...").fill("missing");
  await expect(page.locator("#campaigns").getByText("Ma'lumot yo'q",{exact:true})).toBeVisible();
  await page.getByPlaceholder("Kampaniya qidirish...").fill("Test");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"CSV",exact:true}).click();
  expect((await download).suggestedFilename()).toBe("kampaniyalar.csv");
  await page.getByRole("combobox",{name:/^Platforma/}).selectOption("facebook");
  const request=page.waitForRequest(req=>req.url().includes("/api/analytics/summary") && new URL(req.url()).searchParams.get("platform")==="facebook");
  await page.getByRole("button",{name:"Filtrni qo'llash",exact:true}).click();await request;
  await expect(page.locator("#campaigns tbody tr")).toHaveCount(1);
  await layout(page);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:"test-results/dashboard-data.png",fullPage:true});expect(errors).toEqual([]);
});
