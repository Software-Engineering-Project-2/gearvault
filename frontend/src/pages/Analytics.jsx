import React, { useEffect, useState } from 'react'
import { api, getToken } from '../lib/api'

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

  const loadAnalytics = async () => {
    setLoading(true)
    setError('')
    try {
      const [res, dRes] = await Promise.all([
        api('/manager/analytics'),
        api('/staff/disputes').catch(() => ({ disputes: [] }))
      ])
      setData(res)
      setDisputes(dRes.disputes || [])
    } catch (err) {
      setError(err.message || 'Failed to load manager analytics')
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    loadAnalytics()
  }, [])

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

  return (
    <div className="analytics-page">
      {/* Header & Export CTA */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>Operations & Analytics Dashboard</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Track business revenue, most-rented equipment, category damage trends, and overdue fleet status (FR027).
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
            {/* 1. Most Rented Items */}
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
                      {mostRented.map((item, idx) => (
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

            {/* 2. Damage Trends by Category */}
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
        </>
      )}
    </div>
  )
}
