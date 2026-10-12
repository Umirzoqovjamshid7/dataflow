export const routes = {
  dashboard: {path:"/dashboard", title:"Marketing tahlili", subtitle:"Reklama xarajatidan sotuvgacha bo'lgan natijalar", icon:"▦"},
  crm: {path:"/crm", title:"CRM va sotuvlar", subtitle:"Kompaniyangizning sinxronlangan CRM ma'lumotlari", icon:"▤"},
  employees: {path:"/employees", title:"Xodimlar", subtitle:"Jamoa yuklamasi va biriktirilgan bitimlar", icon:"♙"},
  calls: {path:"/calls", title:"Qo'ng'iroqlar", subtitle:"Qo'ng'iroqlar va suhbat ko'rsatkichlari", icon:"☎"},
  plans: {path:"/plans", title:"Plan / Fakt", subtitle:"Oylik rejalar va haqiqiy natijalar", icon:"▥"},
  ai: {path:"/ai-advisor", title:"AI Agent", subtitle:"Marketing va biznes ma'lumotlari tahlili", icon:"✦"},
  settings: {path:"/settings", title:"Sozlamalar", subtitle:"Integratsiyalar, til va ko'rinish", icon:"⚙"},
  team: {path:"/team", title:"Jamoa", subtitle:"Kompaniya foydalanuvchilari va ruxsatlar", icon:"♙"},
  admin: {path:"/admin", title:"Umumiy tahlil", subtitle:"Mavjud boshqaruv sahifasi", icon:"▦"},
};
export function pageFromPath(pathname) {
  return Object.keys(routes).find(key=>routes[key].path===pathname) || "dashboard";
}
export function navigationItems(role) {
  const keys=["dashboard"];
  if (["tenant_admin","marketer","analyst"].includes(role)) keys.push("crm","employees","calls","plans");
  if (role === "tenant_admin") keys.push("team");
  keys.push("ai","settings");
  return keys.map(key=>({key,...routes[key]}));
}
