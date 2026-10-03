import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { getStoragePublicUrl, uploadStorageFile } from '../lib/storage'

const getItemImageUrl = imagePath => {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath)) return imagePath
  return getStoragePublicUrl(imagePath)
}

export default function Equipment() {
  const [equipmentList, setEquipmentList] = useState([])
  const [categoriesList, setCategoriesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  // Modal & form state
  const [showAddModal, setShowAddModal] = useState(false)
  const [submittingItem, setSubmittingItem] = useState(false)
  const [togglingItemId, setTogglingItemId] = useState(null)
  const [newItemImageFile, setNewItemImageFile] = useState(null)
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    purchase_price: '',
    replacement_price: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    description: '',
    image_path: 'camera.svg',
  })

  // Financial Audit Trail state
  const [auditLogs, setAuditLogs] = useState([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)

  const loadEquipmentData = async () => {
    setLoading(true)
    setError('')
    try {
      const [itemsRes, catRes] = await Promise.all([
        api('/items?include_inactive=true').catch(() => ({ items: [] })),
        api('/categories').catch(() => ({ categories: [] })),
      ])
      setEquipmentList(itemsRes.items || [])
      setCategoriesList(catRes.categories || [])
      if (catRes.categories?.length > 0 && !newItemForm.category_id) {
        setNewItemForm(prev => ({ ...prev, category_id: catRes.categories[0].id }))
      }
    } catch (err) {
      setError(err.message || 'Failed to load equipment catalog')
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    setLoadingAudit(true)
    try {
      const res = await api('/manager/audit-logs')
      setAuditLogs(res.audit_logs || [])
    } catch (err) {
      console.error('Failed to load audit logs', err)
    } finally {
      setLoadingAudit(false)
    }
  }

  const toggleAuditTrail = () => {
    const next = !auditOpen
    setAuditOpen(next)
    if (next && auditLogs.length === 0) {
      loadAuditLogs()
    }
  }

  useEffect(() => {
    loadEquipmentData()
  }, [])

  const handleAddItemSubmit = async (e) => {
    e.preventDefault()
    setSubmittingItem(true)
    setError('')
    setActionMessage('')

    try {
      const uploadedImage = newItemImageFile
        ? await uploadStorageFile(newItemImageFile, 'items')
        : null
      const payload = {
        name: newItemForm.name.trim(),
        sku: newItemForm.sku.trim(),
        category_id: Number(newItemForm.category_id),
        purchase_price: Number(newItemForm.purchase_price),
        replacement_price: Number(newItemForm.replacement_price),
        purchase_date: newItemForm.purchase_date,
        description: newItemForm.description.trim() || undefined,
        image_path: uploadedImage?.path || newItemForm.image_path.trim() || undefined,
      }

      const res = await api('/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setActionMessage(res.message || `Equipment '${newItemForm.name}' added successfully!`)
      setShowAddModal(false)
      setNewItemImageFile(null)
      setNewItemForm({
        name: '',
        sku: '',
        category_id: categoriesList[0]?.id || '',
        purchase_price: '',
        replacement_price: '',
        purchase_date: new Date().toISOString().slice(0, 10),
        description: '',
        image_path: 'camera.svg',
      })

      const itemsRes = await api('/items?include_inactive=true')
      setEquipmentList(itemsRes.items || [])
    } catch (err) {
      setError(err.message || 'Failed to add equipment')
    } finally {
      setSubmittingItem(false)
    }
  }

  const handleToggleItemStatus = async (item) => {
    setTogglingItemId(item.id)
    setError('')
    setActionMessage('')
    try {
      if (item.active) {
        const res = await api(`/items/${item.id}`, { method: 'DELETE' })
        setActionMessage(res.message || `Equipment '${item.name}' decommissioned.`)
      } else {
        const res = await api(`/items/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify({ active: true }),
        })
        setActionMessage(res.message || `Equipment '${item.name}' reactivated.`)
      }
      const itemsRes = await api('/items?include_inactive=true')
      setEquipmentList(itemsRes.items || [])
    } catch (err) {
      setError(err.message || 'Failed to update equipment status')
    } finally {
      setTogglingItemId(null)
    }
  }

  return (
    <div className="equipment-page">
      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>🛠️ Equipment Fleet Management</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Manage rental inventory assets, commission new stock, and decommission or reactivate units.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn secondary sm" onClick={loadEquipmentData} disabled={loading}>
              🔄 Refresh
            </button>
            <button
              className="btn sm"
              onClick={() => {
                if (categoriesList.length > 0 && !newItemForm.category_id) {
                  setNewItemForm(prev => ({ ...prev, category_id: categoriesList[0].id }))
                }
                setShowAddModal(true)
              }}
            >
              + Add New Equipment
            </button>
          </div>
        </div>

        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
        {actionMessage && <div className="notice success" style={{ marginTop: 14 }}>{actionMessage}</div>}
      </div>

      {/* Equipment Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Active & Decommissioned Inventory</h3>
            <p className="muted small" style={{ margin: '2px 0 0' }}>
              Total units: {equipmentList.length} ({equipmentList.filter(i => i.active).length} active, {equipmentList.filter(i => !i.active).length} decommissioned)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading equipment fleet…</div>
        ) : equipmentList.length === 0 ? (
          <div className="empty">No equipment assets found in the catalog.</div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Equipment / SKU</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Purchase Price</th>
                  <th style={{ textAlign: 'right' }}>Replacement Val</th>
                  <th>Purchase Date</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {equipmentList.map(item => (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.6 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={getItemImageUrl(item.image_path || 'camera.svg')}
                          alt=""
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            objectFit: 'contain',
                            background: '#f1f5f9',
                            padding: 2,
                          }}
                          onError={(e) => {
                            e.currentTarget.onerror = null
                            e.currentTarget.src = getItemImageUrl('camera.svg')
                          }}
                        />
                        <div>
                          <strong>{item.name}</strong>
                          <div className="small muted">{item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{item.category?.name || 'Gear'}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      ₹{Number(item.purchase_price || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ₹{Number(item.replacement_price || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="small muted">
                      {item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${item.active ? 'available' : 'unavailable'}`}>
                        {item.active ? '● Active' : '○ Decommissioned'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn sm ${item.active ? 'secondary' : ''}`}
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleToggleItemStatus(item)}
                        disabled={togglingItemId === item.id}
                      >
                        {togglingItemId === item.id
                          ? 'Saving…'
                          : item.active
                          ? 'Decommission'
                          : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Financial Audit Trail */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>📜 Financial Audit Trail</h3>
            <p className="muted small" style={{ margin: '2px 0 0' }}>
              Tamper-evident audit log of asset transactions, deposits, refunds, damage deductions, and overrides.
            </p>
          </div>
          <button className="btn secondary sm" onClick={toggleAuditTrail}>
            {auditOpen ? '▲ Hide Audit Logs' : '▼ View Audit Trail'}
          </button>
        </div>

        {auditOpen && (
          <div style={{ marginTop: 16 }}>
            {loadingAudit ? (
              <div className="empty">Loading financial audit trail…</div>
            ) : auditLogs.length === 0 ? (
              <div className="empty">No financial audit records logged yet.</div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Customer ID</th>
                      <th>Actor</th>
                      <th>Details & Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id}>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span className="badge" style={{ textTransform: 'capitalize' }}>
                            {log.action?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: log.amount > 0 ? 'var(--accent)' : 'inherit' }}>
                          ₹{Number(log.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="small" style={{ fontFamily: 'monospace' }}>
                          {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
                        </td>
                        <td className="small muted">
                          {log.performed_by ? log.performed_by.slice(0, 8) + '…' : 'System'}
                        </td>
                        <td className="small" style={{ maxWidth: 260 }}>
                          {log.metadata ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                              {JSON.stringify(log.metadata)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '28px',
              maxWidth: 580,
              width: '100%',
              boxShadow: 'var(--modal-shadow)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 19 }}>🛠️ Add New Rental Equipment</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Commission new gear into the catalog with purchase details & replacement value.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-row">
                <label>Equipment Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sony FX3 Cinema Camera"
                  value={newItemForm.name}
                  onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-row">
                  <label>SKU / Serial Identifier *</label>
                  <input
                    type="text"
                    placeholder="e.g. CAM-FX3-001"
                    value={newItemForm.sku}
                    onChange={e => setNewItemForm({ ...newItemForm, sku: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Category *</label>
                  <select
                    value={newItemForm.category_id}
                    onChange={e => setNewItemForm({ ...newItemForm, category_id: e.target.value })}
                    required
                  >
                    {categoriesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-row">
                  <label>Original Purchase Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 399000"
                    value={newItemForm.purchase_price}
                    onChange={e => setNewItemForm({ ...newItemForm, purchase_price: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Replacement Value (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 420000"
                    value={newItemForm.replacement_price}
                    onChange={e => setNewItemForm({ ...newItemForm, replacement_price: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-row">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    value={newItemForm.purchase_date}
                    onChange={e => setNewItemForm({ ...newItemForm, purchase_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Equipment Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setNewItemImageFile(e.target.files?.[0] || null)}
                  />
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {newItemImageFile ? newItemImageFile.name : 'Optional. Uses the default catalog image when empty.'}
                  </p>
                </div>
              </div>

              <div className="form-row">
                <label>Equipment Description & Specifications</label>
                <textarea
                  rows="3"
                  placeholder="Full-frame cinema line camera with 4K 120p, dual base ISO, cooling fan..."
                  value={newItemForm.description}
                  onChange={e => setNewItemForm({ ...newItemForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => setShowAddModal(false)}
                  disabled={submittingItem}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn sm"
                  disabled={submittingItem}
                >
                  {submittingItem ? 'Adding to Catalog…' : '✓ Commission Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
