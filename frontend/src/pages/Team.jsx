import React, {useEffect, useState} from "react";
import {request} from "../api";

export default function Team({tenantId}) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const path = `/api/admin/tenants/${tenantId}/users`;
  function load() {
    setLoading(true);
    request(path).then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, [tenantId]);
  async function create(e) {
    e.preventDefault(); setBusy(true); setError("");
    const form = e.currentTarget;
    try { await request(path, {method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form)))}); form.reset(); load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel">
    <h1>Team</h1>
    {error && <p className="error" role="alert">{error}</p>}
    <form className="inline-form" onSubmit={create}>
      <input name="full_name" aria-label="Full name" placeholder="Full name" required maxLength={180}/>
      <input name="email" aria-label="Email" type="email" placeholder="Email" required/>
      <input name="password" aria-label="Initial password" type="password" placeholder="Initial password" minLength={14} maxLength={128} autoComplete="new-password" required/>
      <select name="role" aria-label="Role">{["tenant_admin", "marketer", "sales_manager", "analyst"].map(r => <option key={r}>{r}</option>)}</select>
      <button disabled={busy}>Create user</button>
    </form>
    {loading ? <p role="status">Loading team…</p> : <div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>{users.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.active ? "Active" : "Disabled"}</td></tr>)}</tbody>
    </table>{!users.length && <p>No users yet.</p>}</div>}
  </section>;
}
