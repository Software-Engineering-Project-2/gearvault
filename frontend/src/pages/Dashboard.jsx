import React, { useEffect, useMemo, useState } from 'react'
import { api, getUser } from '../lib/api'

const localInputValue = date => {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const futureLocal = hours => {
  const d = new Date(Date.now() + hours * 3600000)
  d.setMinutes(0, 0, 0)
  return localInputValue(d)
}
const toIso = value => new Date(value).toISOString()

export default function Dashboard() {
  const [user] = useState(getUser())
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [start, setStart] = useState(futureLocal(24))
  const [end, setEnd] = useState(futureLocal(48))
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  // One hour buffer ensures a datetime-local value cannot already be in the past.
  const minimumStart = useMemo(() => futureLocal(1), [])
  const isWindowValid = Boolean(
    start && end && new Date(start) >= new Date(minimumStart) && new Date(end) > new Date(start)
  )

  async function loadCatalog() {
    if (!isWindowValid) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const p = new URLSearchParams({ search, start_ts: toIso(start), end_ts: toIso(end) })
      if (category) p.set('category_id', category)
      const data = await api(`/items?${p}`)
      setItems(data.items || [])
    } catch (e) {
      setMessage(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api('/categories')
      .then(d => setCategories(d.categories || []))
      .catch(e => setMessage(e.message))
  }, [])

  useEffect(() => {
    const id = setTimeout(loadCatalog, 250)
    return () => clearTimeout(id)
  }, [search, category, start, end])

  function updateStart(value) {
    setStart(value)
    if (!end || new Date(end) <= new Date(value)) {
      setEnd(localInputValue(new Date(new Date(value).getTime() + 24 * 3600000)))
    }
  }

  async function hold(item) {
    if (!isWindowValid) return
    try {
      const d = await api('/bookings/hold', {
        method: 'POST',
        body: JSON.stringify({ item_id: item.id, start_ts: toIso(start), end_ts: toIso(end) })
      })
      setMessage(
        `Hold placed for ${item.name}! Valid for 15 minutes. Deposit required: ₹${d.booking.deposit_amount}.`
      )
      loadCatalog()
    } catch (e) {
      setMessage(e.message)
      loadCatalog()
    }
  }

  return (
    <div>
      <div className="card">
        <h3>Welcome{user ? `, ${user.full_name || user.email}` : ''}</h3>
        <p className="muted">
          Search equipment and select your rental window to calculate dynamic depreciation rates.
        </p>
        {message && <p className="notice">{message}</p>}
      </div>

      <div className="card">
        <h3>Equipment Catalog</h3>
        <div className="filters">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search equipment by name or SKU"
          />
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label>
            From
            <input
              type="datetime-local"
              min={minimumStart}
              value={start}
              onChange={e => updateStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              min={start || minimumStart}
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </label>
        </div>

        {!isWindowValid && (
          <p className="notice">
            Choose a future start time and an end time after it to see availability and dynamic rates.
          </p>
        )}

        {loading ? (
          <div className="empty">Checking availability and calculating dynamic rates…</div>
        ) : (
          <div className="catalog-grid">
            {items.length ? (
              items.map(item => (
                <article className="item-card" key={item.id}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <h4 style={{ margin: 0 }}>{item.name}</h4>
                      {item.sku && <span className="badge" style={{ fontSize: 11 }}>{item.sku}</span>}
                    </div>
                    <p className="muted small" style={{ margin: '4px 0 8px' }}>
                      {item.category?.name || 'General'} • Valuation: ₹{item.depreciated_value?.toLocaleString('en-IN') || item.purchase_price?.toLocaleString('en-IN')}
                    </p>
                    <p style={{ margin: '4px 0 12px' }}>{item.description}</p>

                    {/* Dynamic Pricing Box */}
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="muted small">Daily Base Rate:</span>
                        <strong style={{ color: '#0f172a' }}>₹{item.daily_rate?.toLocaleString('en-IN')}/day</strong>
                      </div>
                      
                      {item.estimated_price !== undefined && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span className="muted small">
                              Rental ({item.duration_days}d • {item.duration_tier} Tier):
                            </span>
                            <strong style={{ color: 'var(--accent, #ff5722)', fontSize: 15 }}>
                              ₹{item.estimated_price?.toLocaleString('en-IN')}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span className="muted small">Refundable Deposit:</span>
                            <span className="small">₹{item.estimated_deposit?.toLocaleString('en-IN')}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <span className={`badge ${item.available ? 'available' : 'unavailable'}`}>
                      {item.available ? 'Available' : 'Unavailable'}
                    </span>
                    <button
                      className="btn"
                      disabled={!item.available || !isWindowValid}
                      onClick={() => hold(item)}
                    >
                      {item.available ? 'Place 15-min hold' : 'Not available'}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              isWindowValid && <div className="empty">No catalog items match these filters.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
