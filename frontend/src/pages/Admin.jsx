import React, {useEffect, useState} from "react";
import {request} from "../api";
import Team from "./Team";
import Kpi from "../components/Kpi";

export default function Admin({t}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function load() {
    request("/api/admin/tenants").then(setTenants).catch(e => setError(e.message));
    request("/api/admin/summary").then(setSummary).catch(e => setError(e.message));
  }

  useEffect(load, []);

  async function createTenant(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
    await request("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({name, slug})
    });
    setName(""); setSlug(""); load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="page-head"><div><h1>{t.superAdmin}</h1><p>{t.allCustomers}</p></div></div>
    {summary && <div className="kpis">{Object.entries(summary).filter(([key]) => key !== "metric_source").map(([key, value]) => <Kpi key={key} label={key.replaceAll("_", " ")} value={value}/>)}</div>}
    {selected && <><button onClick={() => setSelected(null)}>{t.closeTeam}</button><Team tenantId={selected} t={t}/></>}

    <section className="panel">
      <h2>{t.createClient}</h2>
      <form className="inline-form" onSubmit={createTenant}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder={t.companyName} required/>
        <input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="company-slug" required/>
        <button disabled={busy}>{busy ? t.loading : t.create}</button>
      </form>
    </section>

    <section className="panel">
      <h2>{t.clients}</h2>
      <div className="tenant-grid">
        {tenants.map(tenant=><div className="tenant-card" key={tenant.id}>
          <div><strong>{tenant.name}</strong><small>/{tenant.slug}</small></div>
          <div className="tenant-stats">
            <span>{t.users} <b>{tenant.users}</b></span>
            <span>{t.leads} <b>{tenant.leads}</b></span>
          </div>
          <span className={tenant.active ? "status on" : "status"}>{tenant.active ? t.active : t.disabled}</span>
          <button onClick={() => setSelected(tenant.id)}>{t.manageTeam}</button>
          <button onClick={async () => {
            if (!window.confirm(`${tenant.active ? "Disable" : "Activate"} ${tenant.name}?`)) return;
            try { await request(`/api/admin/tenants/${tenant.id}`, {method: "PATCH", body: JSON.stringify({active: !tenant.active})}); load(); }
            catch (e) { setError(e.message); }
          }}>{tenant.active ? t.disabled : t.active}</button>
        </div>)}
      </div>
    </section>
  </div>
}
