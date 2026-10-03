import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Disputes() {
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  // Manager Override state
  const [overrideAssessmentId, setOverrideAssessmentId] = useState(null)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideNotes, setOverrideNotes] = useState('')
  const [processingOverride, setProcessingOverride] = useState(false)

  const loadDisputes = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api('/staff/disputes')
      setDisputes(res.disputes || [])
    } catch (err) {
      setError(err.message || 'Failed to load customer disputes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDisputes()
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
        }),
      })

      setActionMessage(res.message || 'Dispute successfully resolved and settlement updated.')
      setOverrideAssessmentId(null)
      setOverrideAmount('')
      setOverrideNotes('')
      loadDisputes()
    } catch (err) {
      setError(err.message || 'Failed to apply manager override.')
    } finally {
      setProcessingOverride(false)
    }
  }

  return (
    <div className="disputes-page">
      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>⚖️ Customer Damage Disputes</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Review contested damage assessments, inspect customer dispute statements, and apply manager settlement adjustments.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${disputes.length > 0 ? 'disputed' : 'available'}`}>
              {disputes.length > 0 ? `⚠️ ${disputes.length} Contested` : '✓ 0 Pending'}
            </span>
            <button className="btn secondary sm" onClick={loadDisputes} disabled={loading}>
              🔄 Refresh
            </button>
          </div>
        </div>

        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
        {actionMessage && <div className="notice success" style={{ marginTop: 14 }}>{actionMessage}</div>}
      </div>

      {loading ? (
        <div className="card empty">Loading customer disputes…</div>
      ) : disputes.length === 0 ? (
        <div className="card empty" style={{ padding: '36px 20px', textAlign: 'center' }}>
          <h3>✓ All Settled</h3>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            No customer damage assessment disputes are currently pending review. All return assessments are finalized.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {disputes.map(d => (
            <div
              key={d.id}
              className="card dispute-card"
              style={{
                margin: 0,
                border: '1px solid #fde68a',
                boxShadow: '0 4px 18px rgba(245, 158, 11, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>
                    {d.rental?.item?.name || 'Equipment Rental'}
                  </h3>
                  <p className="small muted" style={{ margin: '3px 0 0' }}>
                    Rental #{d.rental_id} • Disputed on {new Date(d.disputed_at).toLocaleString()}
                    {d.rental?.customer_id && (
                      <span> • Customer ID: <code style={{ fontSize: 12 }}>{d.rental.customer_id.slice(0, 8)}…</code></span>
                    )}
                  </p>
                </div>
                <span className="badge disputed">⚠️ Customer Disputed</span>
              </div>

              {/* Customer Dispute statement */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', margin: '14px 0' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', marginBottom: 4, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                  Customer Dispute Statement
                </div>
                <div style={{ fontSize: 14.5, color: '#78350f', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{d.dispute_reason}"
                </div>
              </div>

              {/* Assessment Meta Box */}
              <div className="meta-box" style={{ margin: '14px 0' }}>
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
                <form
                  onSubmit={(e) => handleOverrideSubmit(e, d.id)}
                  style={{
                    marginTop: 14,
                    background: '#f8fafc',
                    padding: 16,
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10, color: 'var(--accent)' }}>
                    Manager Dispute Resolution & Deduction Override
                  </div>
                  <div className="form-row">
                    <label>Revised Damage Deduction (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={overrideAmount}
                      onChange={e => setOverrideAmount(e.target.value)}
                      placeholder="Enter revised deduction amount (e.g. 500 or 0 to waive)"
                      required
                    />
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      Adjust deduction to an acceptable amount or set to 0 to fully waive customer liability.
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
  )
}
