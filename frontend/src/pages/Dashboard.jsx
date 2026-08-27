import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabaseClient'

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

const getItemImageUrl = imagePath => {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath)) return imagePath

  const bucket = import.meta.env.VITE_SUPABASE_ITEMS_BUCKET || 'item-images'
  const path = imagePath.replace(/^\/+/, '')
  const storagePath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
}

export default function Dashboard() {
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
                  {getItemImageUrl(item.image_path) && (
                    <div className="catalog-item-image-wrap">
                      <img
                        className="catalog-item-image"
                        src={getItemImageUrl(item.image_path)}
                        alt={item.name}
                        onError={event => { event.currentTarget.parentElement.hidden = true }}
                      />
                    </div>
                  )}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <h4 style={{ margin: 0 }}>
                        <Link to={`/items/${item.id}`} state={{ start, end }} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {item.name}
                        </Link>
                      </h4>
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
                    <Link
                      to={`/items/${item.id}`}
                      state={{ start, end }}
                      className="btn"
                    >
                      View Details & Book
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              isWindowValid && <div className="empty">No equipment available matching your criteria.</div>
            )}
          </div>
        )}
      </div>


    </div>
  )
}
