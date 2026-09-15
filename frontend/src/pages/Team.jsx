import React, {useEffect, useState} from "react";
import {request} from "../api";

export default function Team({tenantId, t}) {
  const [users, setUsers] = useState([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const path = `/api/admin/tenants/${tenantId}/users`;
  function load() { setLoading(true); request(path).then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false)); }
  useEffect(load, [tenantId]);
  async function create(e) { e.preventDefault(); setBusy(true); setError(""); const form=e.currentTarget; try { await request(path,{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form)))}); form.reset(); load(); } catch(e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="panel"><h1>{t.teamTitle}</h1>{error && <p className="error" role="alert">{error}</p>}
    <form className="inline-form" onSubmit={create}><input name="full_name" aria-label={t.fullName} placeholder={t.fullName} required maxLength={180}/><input name="email" aria-label={t.email} type="email" placeholder={t.email} required/><input name="password" aria-label={t.initialPassword} type="password" placeholder={t.initialPassword} minLength={14} maxLength={128} autoComplete="new-password" required/><select name="role" aria-label={t.role}>{["tenant_admin","marketer","sales_manager","analyst"].map(r=><option key={r}>{r}</option>)}</select><button disabled={busy}>{t.createUser}</button></form>
    {loading ? <p role="status">{t.loading}</p> : <div className="table-wrap"><table><thead><tr><th>{t.fullName}</th><th>{t.email}</th><th>{t.role}</th><th>{t.status}</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.active ? t.active : t.disabled}</td></tr>)}</tbody></table>{!users.length && <p>{t.noUsers}</p>}</div>}
  </section>;
}
