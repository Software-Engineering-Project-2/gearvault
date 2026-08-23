import React, { useEffect, useMemo, useState } from 'react'
import { api, getUser } from '../lib/api'
import SignInPromptModal from '../components/SignInPromptModal'

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
  const [selectedHoldItem, setSelectedHoldItem] = useState(null)

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

    // If user is not signed in, show Sign In Prompt Modal
    if (!user) {
      setSelectedHoldItem(item)
      return
    }

    try {
      const d = await api('/bookings/hold', {
        method: 'POST',
        body: JSON.stringify({ item_id: item.id, start_ts: toIso(start), end_ts: toIso(end) })
      })
      setMessage(
        `Reservation hold placed for ${item.name}. Active for 15 minutes. Deposit: ₹${d.booking.deposit_amount}.`
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
        <div className="card-header" style={{ marginBottom: 4 }}>
          <div>
            <h2>Equipment Inventory</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Precision production and cinema hardware. Select your project dates to check live availability and calculate rates.
            </p>
          </div>
        </div>
        {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Available Gear</h3>
        </div>

        <div className="filters">
          <div>
            <label>Search Equipment</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by model or SKU..."
            />
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label>
            Rental Start
            <input
              type="datetime-local"
              min={minimumStart}
              value={start}
              onChange={e => updateStart(e.target.value)}
            />
          </label>
          <label>
            Rental Return
            <input
              type="datetime-local"
              min={start || minimumStart}
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </label>
        </div>

        {!isWindowValid && (
          <div className="notice">
            Please specify a future start date and return date to view live equipment availability.
          </div>
        )}

        {loading ? (
          <div className="empty">Loading equipment catalog…</div>
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
                    <p className="muted small" style={{ margin: '4px 0 10px' }}>
                      {item.category?.name || 'General'} • Valuation: ₹{item.depreciated_value?.toLocaleString('en-IN') || item.purchase_price?.toLocaleString('en-IN')}
                    </p>
                    <p style={{ margin: '4px 0 14px', fontSize: 13.5 }}>{item.description}</p>

                    {/* Apple Dynamic Pricing Preview Box */}
                    <div className="pricing-preview-box">
                      <div className="pricing-preview-row">
                        <span className="muted small">Daily Rate:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>₹{item.daily_rate?.toLocaleString('en-IN')}/day</strong>
                      </div>
                      
                      {item.estimated_price !== undefined && (
                        <>
                          <div className="pricing-preview-row" style={{ marginTop: 5 }}>
                            <span className="muted small">
                              Estimated Fee ({item.duration_days}d):
                            </span>
                            <strong style={{ color: 'var(--accent)', fontSize: 15 }}>
                              ₹{item.estimated_price?.toLocaleString('en-IN')}
                            </strong>
                          </div>
                          <div className="pricing-preview-row" style={{ marginTop: 4 }}>
                            <span className="muted small">Security Deposit:</span>
                            <span className="small" style={{ fontWeight: 500 }}>₹{item.estimated_deposit?.toLocaleString('en-IN')}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                    <span className={`badge ${item.available ? 'available' : 'unavailable'}`}>
                      {item.available ? '● Available' : '● In Use'}
                    </span>
                    <button
                      className="btn"
                      disabled={!item.available || !isWindowValid}
                      onClick={() => hold(item)}
                    >
                      {item.available ? 'Reserve Gear' : 'Unavailable'}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              isWindowValid && <div className="empty">No equipment available matching your criteria.</div>
            )}
          </div>
        )}
      </div>

      {/* Guest Sign-In Prompt Modal when reserving without authentication */}
      <SignInPromptModal
        isOpen={Boolean(selectedHoldItem)}
        onClose={() => setSelectedHoldItem(null)}
        title="Sign In to Reserve Equipment"
        message={`Please sign in or create an account to place a 15-minute reservation hold on ${selectedHoldItem?.name || 'this item'}.`}
      />
    </div>
  )
}
