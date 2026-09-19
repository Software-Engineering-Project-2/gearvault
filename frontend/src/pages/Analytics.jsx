import React, { useEffect, useState } from 'react'
import { api, getToken } from '../lib/api'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

export default function Analytics() {
  const [data, setData] = useState(null)
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [exporting, setExporting] = useState(false)

  // Manager Override state (BR3)
  const [overrideAssessmentId, setOverrideAssessmentId] = useState(null)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideNotes, setOverrideNotes] = useState('')
  const [processingOverride, setProcessingOverride] = useState(false)

  // Manager Equipment Fleet Management state (SRS §2.3, §3.1)
  const [equipmentList, setEquipmentList] = useState([])
  const [categoriesList, setCategoriesList] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [submittingItem, setSubmittingItem] = useState(false)
  const [togglingItemId, setTogglingItemId] = useState(null)
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    purchase_price: '',
    replacement_price: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    description: '',
    image_path: '/images/items/camera.svg',
  })

  // Financial Audit Trail state (SRS §5.3, §6.1)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)

  const loadAnalytics = async () => {
    setLoading(true)
    setError('')
    try {
      const [res, dRes, itemsRes, catRes] = await Promise.all([
        api('/manager/analytics'),
        api('/staff/disputes').catch(() => ({ disputes: [] })),
        api('/items?include_inactive=true').catch(() => ({ items: [] })),
        api('/categories').catch(() => ({ categories: [] })),
      ])
      setData(res)
      setDisputes(dRes.disputes || [])
      setEquipmentList(itemsRes.items || [])
      setCategoriesList(catRes.categories || [])
      if (catRes.categories?.length > 0 && !newItemForm.category_id) {
        setNewItemForm(prev => ({ ...prev, category_id: catRes.categories[0].id }))
      }
    } catch (err) {
      setError(err.message || 'Failed to load manager analytics')
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
    loadAnalytics()
  }, [])

  const handleOverrideSubmit = async (e, assessmentId) => {
    e.preventDefault()
    if (!assessmentId) return
    setProcessingOverride(true)
    setError('')
    setActionMessage('')

    try {
      const res = await api(`/manager/disputes/${assessmentId}/override`, {
        method: 'POST',
        body: JSON.stringify({
          override_amount: Number(overrideAmount),
          manager_notes: overrideNotes || 'Manager direct override applied.',
        })
      })

      setActionMessage(res.message || 'Dispute successfully resolved and settlement updated.')
      setOverrideAssessmentId(null)
      setOverrideAmount('')
      setOverrideNotes('')
      loadAnalytics()
    } catch (err) {
      setError(err.message || 'Failed to apply manager override.')
    } finally {
      setProcessingOverride(false)
    }
  }

  const handleAddItemSubmit = async (e) => {
    e.preventDefault()
    setSubmittingItem(true)
    setError('')
    setActionMessage('')

    try {
      const payload = {
        name: newItemForm.name.trim(),
        sku: newItemForm.sku.trim(),
        category_id: Number(newItemForm.category_id),
        purchase_price: Number(newItemForm.purchase_price),
        replacement_price: Number(newItemForm.replacement_price),
        purchase_date: newItemForm.purchase_date,
        description: newItemForm.description.trim() || undefined,
        image_path: newItemForm.image_path.trim() || undefined,
      }

      const res = await api('/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setActionMessage(res.message || `Equipment '${newItemForm.name}' added successfully!`)
      setShowAddModal(false)
      setNewItemForm({
        name: '',
        sku: '',
        category_id: categoriesList[0]?.id || '',
        purchase_price: '',
        replacement_price: '',
        purchase_date: new Date().toISOString().slice(0, 10),
        description: '',
        image_path: '/images/items/camera.svg',
      })

      // Refresh fleet and analytics
      const itemsRes = await api('/items?include_inactive=true')
      setEquipmentList(itemsRes.items || [])
      loadAnalytics()
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

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
      const token = getToken()
      const response = await fetch(`${API_URL}/manager/reports/monthly-csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error('Failed to generate CSV export')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gearvault_monthly_report_${new Date().toISOString().slice(0, 7)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Failed to export CSV report')
    } finally {
      setExporting(false)
    }
  }

  const summary = data?.summary || {}
  const mostRented = data?.most_rented_items || []
  const damageTrends = data?.damage_trends || []
  const overdueRentals = data?.overdue_rentals || []

  // Chart 1: Most Rented Equipment (Bar)
  const mostRentedChartData = {
    labels: mostRented.slice(0, 6).map(i => i.name.length > 18 ? i.name.slice(0, 16) + '…' : i.name),
    datasets: [
      {
        label: 'Times Rented',
        data: mostRented.slice(0, 6).map(i => i.rental_count),
        backgroundColor: 'rgba(0, 113, 227, 0.75)',
        borderColor: 'rgb(0, 113, 227)',
        borderWidth: 1.5,
        borderRadius: 6,
      }
    ]
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw} rentals completed`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0, stepSize: 1 }
      }
    }
  }

  // Chart 2: Damage Incidents by Category (Doughnut)
  const damageChartData = {
    labels: damageTrends.map(t => t.category),
    datasets: [
      {
        label: 'Damage Incidents',
        data: damageTrends.map(t => t.incidents),
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(139, 92, 246, 0.8)',
        ],
        borderColor: '#ffffff',
        borderWidth: 2,
      }
    ]
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } }
    }
  }

  // Chart 3: Revenue Composition (Doughnut)
  const revenueChartData = {
    labels: ['Rental Fees', 'Damage Deductions', 'Late Penalties'],
    datasets: [
      {
        data: [
          summary.total_rental_fees || 0,
          summary.total_damage_deductions || 0,
          summary.total_late_penalties || 0,
        ],
        backgroundColor: [
          'rgba(0, 113, 227, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(239, 68, 68, 0.85)',
        ],
        borderColor: '#ffffff',
        borderWidth: 2,
      }
    ]
  }

  return (
    <div className="analytics-page">
      {/* Header & Export CTA */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>Operations & Analytics Dashboard</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Track business revenue, visual trends, manager inventory equipment, and overdue fleet status (SRS §2.3, §5.3, FR027).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn secondary sm" onClick={loadAnalytics} disabled={loading}>
              🔄 Refresh
            </button>
            <button className="btn sm" onClick={handleExportCsv} disabled={exporting || loading}>
              {exporting ? 'Generating CSV…' : '📥 Export Monthly Report (CSV)'}
            </button>
          </div>
        </div>

        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
        {actionMessage && <div className="notice success" style={{ marginTop: 14 }}>{actionMessage}</div>}
      </div>

      {loading ? (
        <div className="card empty">Loading operations intelligence…</div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total Gross Revenue</div>
              <div className="kpi-value" style={{ color: 'var(--accent)' }}>
                ₹{summary.total_revenue?.toLocaleString('en-IN') || '0'}
              </div>
              <div className="kpi-sub">
                Fees: ₹{summary.total_rental_fees?.toLocaleString('en-IN')} • Deductions: ₹{summary.total_damage_deductions?.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Active Field Deployments</div>
              <div className="kpi-value">
                {summary.active_rentals_count || 0}
              </div>
              <div className="kpi-sub">
                Secured Deposits Held: ₹{summary.total_deposits_held?.toLocaleString('en-IN') || 0}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Overdue Rentals</div>
              <div className="kpi-value" style={{ color: summary.overdue_count > 0 ? '#c9251d' : 'var(--text-primary)' }}>
                {summary.overdue_count || 0}
              </div>
              <div className="kpi-sub">
                Accrued Late Fees: ₹{summary.total_late_penalties?.toLocaleString('en-IN') || 0}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Total Damage Assessed</div>
              <div className="kpi-value" style={{ color: '#b45309' }}>
                ₹{summary.total_damage_deductions?.toLocaleString('en-IN') || '0'}
              </div>
              <div className="kpi-sub">
                Refunds Released: ₹{summary.total_refunds_issued?.toLocaleString('en-IN') || 0}
              </div>
            </div>
          </div>

          {/* Visual Analytics Graphs (Chart.js) */}
          <div className="charts-grid">
            {/* Chart 1: Most Rented Bar Chart */}
            <div className="chart-card">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>📊 Utilization: Top Rented Gear</h4>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Booking frequency across equipment</p>
                </div>
              </div>
              <div className="chart-wrapper">
                {mostRented.length > 0 ? (
                  <Bar data={mostRentedChartData} options={barOptions} />
                ) : (
                  <div className="empty" style={{ paddingTop: 80 }}>No rental history recorded yet.</div>
                )}
              </div>
            </div>

            {/* Chart 2: Damage by Category Doughnut */}
            <div className="chart-card">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>⚠️ Incident Breakdown by Category</h4>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Damage frequency distribution</p>
                </div>
              </div>
              <div className="chart-wrapper">
                {damageTrends.some(t => t.incidents > 0) ? (
                  <Doughnut data={damageChartData} options={doughnutOptions} />
                ) : (
                  <div className="empty" style={{ paddingTop: 80 }}>✓ 0 damage incidents on record.</div>
                )}
              </div>
            </div>

            {/* Chart 3: Revenue Composition Doughnut */}
            <div className="chart-card">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>💰 Revenue Composition</h4>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Rental fees vs deductions vs late penalties</p>
                </div>
              </div>
              <div className="chart-wrapper">
                {summary.total_revenue > 0 ? (
                  <Doughnut data={revenueChartData} options={doughnutOptions} />
                ) : (
                  <div className="empty" style={{ paddingTop: 80 }}>No revenue transactions recorded yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Equipment Fleet & Asset Catalog (SRS §2.3, §3.1) */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3>🛠️ Equipment Fleet Management (SRS §2.3, §3.1)</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Manage rental equipment assets, commission new stock, and decommission or reactivate units.
                </p>
              </div>
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

            {equipmentList.length === 0 ? (
              <div className="empty">No equipment assets found in the system.</div>
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
                              src={item.image_path || '/images/items/camera.svg'}
                              alt=""
                              style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'contain', background: '#f1f5f9', padding: 2 }}
                              onError={(e) => { e.currentTarget.src = '/images/items/camera.svg' }}
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

          {/* Customer Damage Assessment Disputes (BR3) */}
          <div className="card" style={{ marginTop: 24, border: disputes.length > 0 ? '1px solid #f59e0b' : '1px solid var(--card-border)' }}>
            <div className="card-header">
              <div>
                <h3>⚖️ Customer Damage Disputes & Overrides (BR3)</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Under Business Rule BR3, only Managers can review and directly override contested damage deductions without intermediate reviews.
                </p>
              </div>
              <span className={`badge ${disputes.length > 0 ? 'disputed' : 'available'}`}>
                {disputes.length > 0 ? `⚠️ ${disputes.length} Contested` : '✓ 0 Pending'}
              </span>
            </div>

            {disputes.length === 0 ? (
              <div className="empty" style={{ padding: '24px 16px' }}>
                ✓ No customer damage assessment disputes are currently pending review. All return assessments are finalized.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
                {disputes.map(d => (
                  <div key={d.id} className="dispute-card" style={{ margin: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 17 }}>
                          {d.rental?.item?.name || 'Equipment Rental'}
                        </h4>
                        <p className="small muted" style={{ margin: '2px 0 6px' }}>
                          Rental #{d.rental_id} • Disputed on {new Date(d.disputed_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="badge disputed">⚠️ Customer Disputed</span>
                    </div>

                    {/* Customer Dispute statement */}
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', margin: '12px 0' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                        CUSTOMER DISPUTE STATEMENT:
                      </div>
                      <div style={{ fontSize: 14.5, color: '#78350f', fontStyle: 'italic' }}>
                        "{d.dispute_reason}"
                      </div>
                    </div>

                    {/* Assessment Meta Box */}
                    <div className="meta-box" style={{ margin: '12px 0' }}>
                      <div className="meta-row">
                        <span className="muted">Damage Classification:</span>
                        <strong>{d.damage_type?.name || 'Assessed Damage'} (Severity Level {d.severity}/5)</strong>
                      </div>
                      <div className="meta-row">
                        <span className="muted">Assessed Damage Deduction:</span>
                        <strong style={{ color: '#c9251d' }}>₹{d.damage_deduction?.toLocaleString('en-IN')}</strong>
                      </div>
                      {d.late_penalty > 0 && (
                        <div className="meta-row">
                          <span className="muted">Late Return Fee:</span>
                          <strong>₹{d.late_penalty?.toLocaleString('en-IN')}</strong>
                        </div>
                      )}
                      <div className="meta-row">
                        <span className="muted">Initial Deposit Refund:</span>
                        <strong>₹{d.deposit_refunded?.toLocaleString('en-IN')}</strong>
                      </div>
                    </div>

                    {/* Manager Override Form */}
                    {overrideAssessmentId === d.id ? (
                      <form onSubmit={(e) => handleOverrideSubmit(e, d.id)} style={{ marginTop: 14, background: '#f8fafc', padding: 16, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10, color: 'var(--accent)' }}>
                          Manager Direct Override Form (BR3)
                        </div>
                        <div className="form-row">
                          <label>Revised Damage Deduction (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={overrideAmount}
                            onChange={e => setOverrideAmount(e.target.value)}
                            placeholder="Enter revised deduction amount (e.g. 500)"
                            required
                          />
                          <p className="muted small" style={{ margin: '4px 0 0' }}>
                            Adjust deduction to an acceptable amount or set to 0 to fully waive liability.
                          </p>
                        </div>
                        <div className="form-row" style={{ marginTop: 10 }}>
                          <label>Manager Resolution Notes</label>
                          <input
                            type="text"
                            value={overrideNotes}
                            onChange={e => setOverrideNotes(e.target.value)}
                            placeholder="Reason for adjustment (e.g. Pre-existing wear verified, partial waiver granted)..."
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                          <button type="submit" className="btn sm" disabled={processingOverride}>
                            {processingOverride ? 'Applying Override…' : '⚖️ Confirm Manager Override'}
                          </button>
                          <button
                            type="button"
                            className="btn secondary sm"
                            onClick={() => {
                              setOverrideAssessmentId(null)
                              setOverrideAmount('')
                              setOverrideNotes('')
                            }}
                            disabled={processingOverride}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ textAlign: 'right', marginTop: 12 }}>
                        <button
                          className="btn sm"
                          onClick={() => {
                            setOverrideAssessmentId(d.id)
                            setOverrideAmount(d.damage_deduction ?? '')
                            setOverrideNotes('')
                          }}
                        >
                          ⚖️ Override Deduction & Settle Dispute
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grid of Tables: Most Rented & Damage Trends */}
          <div className="analytics-grid" style={{ marginTop: 24 }}>
            {/* 1. Most Rented Items Table */}
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <div>
                  <h3>Most Rented Equipment</h3>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Top revenue and utilization assets</p>
                </div>
              </div>

              {mostRented.length === 0 ? (
                <div className="empty">No equipment rentals recorded yet.</div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'center' }}>Rentals</th>
                        <th style={{ textAlign: 'right' }}>Total Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostRented.map((item) => (
                        <tr key={item.item_id}>
                          <td>
                            <strong>{item.name}</strong>
                            <div className="small muted">{item.sku}</div>
                          </td>
                          <td><span className="badge">{item.category}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.rental_count}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                            ₹{item.total_earned?.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 2. Damage Trends by Category Table */}
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <div>
                  <h3>Damage Frequency by Category</h3>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Cost trends for rate and deposit adjustment</p>
                </div>
              </div>

              {damageTrends.length === 0 ? (
                <div className="empty">No damage incidents on record.</div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th style={{ textAlign: 'center' }}>Damage Incidents</th>
                        <th style={{ textAlign: 'right' }}>Total Cost Assessed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damageTrends.map(trend => (
                        <tr key={trend.category}>
                          <td><strong>{trend.category}</strong></td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${trend.incidents > 0 ? 'held' : 'available'}`}>
                              {trend.incidents} {trend.incidents === 1 ? 'incident' : 'incidents'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9251d' }}>
                            ₹{trend.total_damage_cost?.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 3. Overdue Rentals Fleet Monitoring */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <div>
                <h3>⚠️ Active Overdue Fleet Monitor</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Equipment currently unreturned past scheduled due dates (Subject to automatic late fees & Presumed Lost rule)
                </p>
              </div>
              <span className={`badge ${overdueRentals.length > 0 ? 'unavailable' : 'available'}`}>
                {overdueRentals.length} Overdue
              </span>
            </div>

            {overdueRentals.length === 0 ? (
              <div className="empty">No equipment is currently overdue in the field. All active rentals on schedule.</div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Equipment / SKU</th>
                      <th>Customer ID</th>
                      <th>Due Date</th>
                      <th style={{ textAlign: 'center' }}>Days Late</th>
                      <th style={{ textAlign: 'right' }}>Accrued Penalty (₹500/d)</th>
                      <th style={{ textAlign: 'right' }}>Deposit Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueRentals.map(r => (
                      <tr key={r.rental_id}>
                        <td>
                          <strong>{r.item_name}</strong>
                          {r.sku && <div className="small muted">{r.sku}</div>}
                        </td>
                        <td className="small" style={{ fontFamily: 'monospace' }}>{r.customer_id?.slice(0, 8)}…</td>
                        <td className="small">{new Date(r.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge unavailable" style={{ fontWeight: 700 }}>
                            +{r.overdue_days} {r.overdue_days === 1 ? 'Day' : 'Days'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9251d' }}>
                          ₹{r.accrued_penalty?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          ₹{r.deposit_held?.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Financial Audit Trail (SRS §5.3, §6.1) */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>📜 Financial Audit Trail (SRS §5.3, §5.4, §6.1)</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Tamper-evident audit log of all financial transactions: deposits, refunds, damage deductions, overrides, and auto-escalations.
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
                          <th>User / Actor</th>
                          <th>Details & Audit Metadata</th>
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
        </>
      )}

      {/* Manager Add Equipment Modal (SRS §2.3, §3.1) */}
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
                  <label>Catalog Image Path / Icon</label>
                  <select
                    value={newItemForm.image_path}
                    onChange={e => setNewItemForm({ ...newItemForm, image_path: e.target.value })}
                  >
                    <option value="/images/items/camera.svg">📷 Camera Icon (/images/items/camera.svg)</option>
                    <option value="/images/items/lens.svg">🔍 Lens Icon (/images/items/lens.svg)</option>
                    <option value="/images/items/drone.svg">🛸 Drone Icon (/images/items/drone.svg)</option>
                    <option value="/images/items/lighting.svg">💡 Lighting Icon (/images/items/lighting.svg)</option>
                    <option value="/images/items/audio.svg">🎙️ Audio Icon (/images/items/audio.svg)</option>
                  </select>
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
