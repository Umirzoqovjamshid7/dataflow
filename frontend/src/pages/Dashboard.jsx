import React, {useEffect, useState} from "react";
import {request} from "../api";
import Kpi from "../components/Kpi";
import {BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid} from "recharts";

export default function Dashboard({role}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canAnalytics = role !== "sales_manager";
  const canLeads = ["super_admin", "tenant_admin", "sales_manager"].includes(role);
  const [summary, setSummary] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);

  useEffect(()=>{
    Promise.all([
      canAnalytics ? request("/api/analytics/summary") : Promise.resolve({}),
      canAnalytics ? request("/api/analytics/campaigns") : Promise.resolve([]),
      canLeads ? request("/api/leads") : Promise.resolve([])
    ]).then(([a,b,c])=>{
      setSummary(a); setCampaigns(b); setLeads(c);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [role]);

  if (loading) return <section className="panel" role="status">Loading dashboard…</section>;
  if (error) return <section className="panel error" role="alert">{error}</section>;

  return <div>
    <div className="page-head">
      <div><h1>Marketing Analytics</h1><p>Facebook → Lead → CRM → Sale</p></div>
    </div>

    {canAnalytics && <><div className="kpis">
      <Kpi label="Spend" value={`$${summary.spend || 0}`}/>
      <Kpi label="Leads" value={summary.leads || 0}/>
      <Kpi label="CPL" value={`$${summary.cpl || 0}`}/>
      <Kpi label="CTR" value={`${summary.ctr || 0}%`}/>
      <Kpi label="Sales" value={summary.sales || 0}/>
      <Kpi label="ROAS" value={`${summary.roas || 0}x`}/>
    </div>

    <section className="panel">
      <h2>Campaign performance</h2>
      <div style={{height: 320}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={campaigns}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="name"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="leads" fill="#111827"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>

    <section className="panel">
      <h2>Campaigns</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Campaign</th><th>Spend</th><th>Leads</th><th>CPL</th><th>CTR</th><th>Sales</th><th>ROAS</th></tr></thead>
          <tbody>
            {campaigns.map(x=><tr key={x.id}>
              <td>{x.name}</td><td>${x.spend}</td><td>{x.leads}</td><td>${x.cpl}</td><td>{x.ctr}%</td><td>{x.sales}</td><td>{x.roas}x</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    </>}
    {canLeads && <section className="panel">
      <h2>Latest leads</h2>
      {!leads.length && <p>No leads yet.</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Campaign</th><th>Status</th></tr></thead>
          <tbody>
            {leads.slice(0,20).map(x=><tr key={x.id}>
              <td>{x.name}</td><td>{x.phone}</td><td>{x.source}</td><td>{x.campaign_name || "-"}</td><td><span className="badge">{x.status}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </div>
}
