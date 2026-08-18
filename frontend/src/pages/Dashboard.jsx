import React, { useEffect, useMemo, useState } from 'react'
import { api, getUser } from '../lib/api'

const localInputValue = date => {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const futureLocal = hours => { const d = new Date(Date.now() + hours * 3600000); d.setMinutes(0, 0, 0); return localInputValue(d) }
const toIso = value => new Date(value).toISOString()

export default function Dashboard() {
  const [user] = useState(getUser()); const [items, setItems] = useState([]); const [categories, setCategories] = useState([])
  const [search, setSearch] = useState(''); const [category, setCategory] = useState(''); const [start, setStart] = useState(futureLocal(24)); const [end, setEnd] = useState(futureLocal(48)); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(true)
  // One hour buffer ensures a datetime-local value cannot already be in the past.
  const minimumStart = useMemo(() => futureLocal(1), [])
  const isWindowValid = Boolean(start && end && new Date(start) >= new Date(minimumStart) && new Date(end) > new Date(start))
  async function loadCatalog() { if (!isWindowValid) { setItems([]); setLoading(false); return }; setLoading(true); try { const p = new URLSearchParams({ search, start_ts: toIso(start), end_ts: toIso(end) }); if (category) p.set('category_id', category); setItems((await api(`/items?${p}`)).items) } catch (e) { setMessage(e.message) } finally { setLoading(false) } }
  useEffect(() => { api('/categories').then(d => setCategories(d.categories)).catch(e => setMessage(e.message)) }, [])
  useEffect(() => { const id = setTimeout(loadCatalog, 250); return () => clearTimeout(id) }, [search, category, start, end])
  function updateStart(value) { setStart(value); if (!end || new Date(end) <= new Date(value)) setEnd(localInputValue(new Date(new Date(value).getTime() + 24 * 3600000))) }
  async function hold(item) { if (!isWindowValid) return; try { const d = await api('/bookings/hold', { method: 'POST', body: JSON.stringify({ item_id: item.id, start_ts: toIso(start), end_ts: toIso(end) }) }); setMessage(`Hold created for ${item.name}; it expires at ${new Date(d.booking.hold_expires_at).toLocaleTimeString()}.`); loadCatalog() } catch (e) { setMessage(e.message); loadCatalog() } }
  return <div>
    <div className="card"><h3>Welcome{user ? `, ${user.full_name || user.email}` : ''}</h3><p className="muted">Search equipment and reserve an available time window.</p>{message && <p className="notice">{message}</p>}</div>
    <div className="card"><h3>Catalog</h3><div className="filters"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment" /><select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label>From<input type="datetime-local" min={minimumStart} value={start} onChange={e => updateStart(e.target.value)} /></label><label>To<input type="datetime-local" min={start || minimumStart} value={end} onChange={e => setEnd(e.target.value)} /></label></div>{!isWindowValid && <p className="notice">Choose a future start time and an end time after it to see availability.</p>}
      {loading ? <div className="empty">Checking availability…</div> : <div className="catalog-grid">{items.length ? items.map(item => <article className="item-card" key={item.id}><div><h4>{item.name}</h4><p className="muted small">{item.category?.name}</p><p>{item.description}</p><p><strong>Replacement value: ₹{item.replacement_price}</strong></p></div><span className={`badge ${item.available ? 'available' : 'unavailable'}`}>{item.available ? 'Available' : 'Unavailable'}</span><button className="btn" disabled={!item.available || !isWindowValid} onClick={() => hold(item)}>{item.available ? 'Place 15-min hold' : 'Not available'}</button></article>) : isWindowValid && <div className="empty">No catalog items match these filters.</div>}</div>}</div>
  </div>
}
