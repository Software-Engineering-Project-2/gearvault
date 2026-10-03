import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function OverdueFleet() {
  const [overdueRentals, setOverdueRentals] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOverdueData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api('/manager/analytics')
      setOverdueRentals(res.overdue_rentals || [])
      setSummary(res.summary || {})
    } catch (err) {
      setError(err.message || 'Failed to load overdue fleet status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverdueData()
  }, [])

  const totalLatePenalties = overdueRentals.reduce(
    (acc, r) => acc + (Number(r.accrued_penalty) || 0),
    0
  )
  const totalDepositHeld = overdueRentals.reduce(
    (acc, r) => acc + (Number(r.deposit_held) || 0),
    0
  )

  return (
    <div className="overdue-fleet-page">
      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>⚠️ Active Overdue Fleet Monitor</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Real-time monitoring of unreturned rental gear past scheduled return dates with accrued late penalties.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${overdueRentals.length > 0 ? 'unavailable' : 'available'}`}>
              {overdueRentals.length > 0 ? `⚠️ ${overdueRentals.length} Overdue` : '✓ 0 Overdue'}
            </span>
            <button className="btn secondary sm" onClick={loadOverdueData} disabled={loading}>
              🔄 Refresh
            </button>
          </div>
        </div>

        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      {loading ? (
        <div className="card empty">Loading overdue fleet data…</div>
      ) : (
        <>
          {/* Overdue Metric Cards */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-label">Overdue Field Deployments</div>
              <div className="kpi-value" style={{ color: overdueRentals.length > 0 ? '#c9251d' : 'var(--text-primary)' }}>
                {overdueRentals.length}
              </div>
              <div className="kpi-sub">
                {overdueRentals.length === 0 ? 'All rentals returning on time' : 'Immediate counter attention needed'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Total Accrued Late Penalties</div>
              <div className="kpi-value" style={{ color: '#c9251d' }}>
                ₹{totalLatePenalties.toLocaleString('en-IN')}
              </div>
              <div className="kpi-sub">
                Standard ₹500/day delinquency charge
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Active Deposits Held in Escrow</div>
              <div className="kpi-value" style={{ color: 'var(--accent)' }}>
                ₹{totalDepositHeld.toLocaleString('en-IN')}
              </div>
              <div className="kpi-sub">
                Secured against overdue replacement costs
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Escalation Policy</div>
              <div className="kpi-value" style={{ fontSize: 22, paddingTop: 4 }}>
                7 Days
              </div>
              <div className="kpi-sub">
                Past 7 days: Automatically flagged as Presumed Lost
              </div>
            </div>
          </div>

          {/* Overdue Rentals Table */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Unreturned Gear In Field</h3>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  Equipment unreturned past scheduled due dates
                </p>
              </div>
            </div>

            {overdueRentals.length === 0 ? (
              <div className="empty" style={{ padding: '36px 20px', textAlign: 'center' }}>
                <h3>✓ Fleet On Schedule</h3>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  No equipment is currently overdue in the field. All active rentals are on schedule.
                </p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Equipment / SKU</th>
                      <th>Customer ID</th>
                      <th>Scheduled Due Date</th>
                      <th style={{ textAlign: 'center' }}>Days Late</th>
                      <th style={{ textAlign: 'right' }}>Accrued Penalty (₹500/d)</th>
                      <th style={{ textAlign: 'right' }}>Deposit Held</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueRentals.map(r => (
                      <tr key={r.rental_id}>
                        <td>
                          <strong>{r.item_name}</strong>
                          {r.sku && <div className="small muted">{r.sku}</div>}
                        </td>
                        <td className="small" style={{ fontFamily: 'monospace' }}>
                          {r.customer_id ? `${r.customer_id.slice(0, 8)}…` : '—'}
                        </td>
                        <td className="small">
                          {new Date(r.due_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge unavailable" style={{ fontWeight: 700 }}>
                            +{r.overdue_days} {r.overdue_days === 1 ? 'Day' : 'Days'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9251d' }}>
                          ₹{Number(r.accrued_penalty || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          ₹{Number(r.deposit_held || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge disputed">
                            {r.overdue_days >= 7 ? '⚠️ Presumed Lost Candidate' : 'Delinquent'}
                          </span>
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
