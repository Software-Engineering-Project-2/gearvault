import React, { useEffect, useState } from 'react'
import { api, getUser } from '../lib/api'
import RentalAgreementModal from '../components/RentalAgreementModal'

const formatTime = value => {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function StaffQueue() {
  const [activeTab, setActiveTab] = useState('confirmed') // 'confirmed' | 'active_rentals' | 'disputes'
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [activeRentals, setActiveRentals] = useState([])
  const [damageTypes, setDamageTypes] = useState([])
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Handover modal state
  const [handoverBooking, setHandoverBooking] = useState(null)
  const [showConditionLog, setShowConditionLog] = useState(false)
  const [conditionNotes, setConditionNotes] = useState('Item inspected with client. All standard accessories, caps, and battery included.')
  const [photoUrl, setPhotoUrl] = useState('')
  const [processingHandover, setProcessingHandover] = useState(false)
  const [selectedAgreementData, setSelectedAgreementData] = useState(null)

  // Return & Damage modal state (Increment 4)
  const [returnRental, setReturnRental] = useState(null)
  const [returnNotes, setReturnNotes] = useState('')
  const [returnPhotoUrl, setReturnPhotoUrl] = useState('')
  const [hasDamage, setHasDamage] = useState(false)
  const [damageTypeId, setDamageTypeId] = useState('')
  const [severity, setSeverity] = useState(1)
  const [forcePresumedLost, setForcePresumedLost] = useState(false)
  const [processingReturn, setProcessingReturn] = useState(false)

  // Manager Override state (Increment 4)
  const [overrideAssessmentId, setOverrideAssessmentId] = useState(null)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideNotes, setOverrideNotes] = useState('')
  const [processingOverride, setProcessingOverride] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [bRes, rRes, dtRes, dRes] = await Promise.all([
        api('/staff/bookings/confirmed'),
        api('/staff/rentals/active'),
        api('/damage-types').catch(() => ({ damage_types: [] })),
        api('/staff/disputes').catch(() => ({ disputes: [] }))
      ])
      setConfirmedBookings(bRes.bookings || [])
      setActiveRentals(rRes.rentals || [])
      const types = dtRes.damage_types || []
      setDamageTypes(types)
      if (types.length > 0 && !damageTypeId) {
        setDamageTypeId(types[0].id)
      }
      setDisputes(dRes.disputes || [])
    } catch (err) {
      setError(err.message || 'Failed to load counter operations queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleHandoverSubmit = async (e) => {
    e.preventDefault()
    if (!handoverBooking) return
    setProcessingHandover(true)
    setError('')
    setMessage('')

    try {
      const payload = showConditionLog
        ? { notes: conditionNotes, photo_url: photoUrl }
        : {}

      const res = await api(`/staff/bookings/${handoverBooking.id}/handover`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      setMessage(res.message || 'Equipment successfully dispatched and rental activated.')
      setHandoverBooking(null)
      setShowConditionLog(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to process equipment dispatch.')
    } finally {
      setProcessingHandover(false)
    }
  }

  const handleReturnSubmit = async (e) => {
    e.preventDefault()
    if (!returnRental) return
    setProcessingReturn(true)
    setError('')
    setMessage('')

    try {
      const payload = {
        notes: returnNotes,
        photo_url: returnPhotoUrl,
        has_damage: hasDamage,
        damage_type_id: hasDamage ? Number(damageTypeId) : null,
        severity: hasDamage ? Number(severity) : null,
        force_presumed_lost: forcePresumedLost,
      }

      const res = await api(`/staff/rentals/${returnRental.id}/return`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      setMessage(res.message || 'Return checked in and deposit settlement processed.')
      setReturnRental(null)
      setHasDamage(false)
      setSeverity(1)
      setReturnNotes('')
      setReturnPhotoUrl('')
      setForcePresumedLost(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to process equipment return.')
    } finally {
      setProcessingReturn(false)
    }
  }

  const handleOverrideSubmit = async (e, assessmentId) => {
    e.preventDefault()
    if (!assessmentId) return
    setProcessingOverride(true)
    setError('')
    setMessage('')

    try {
      const res = await api(`/manager/disputes/${assessmentId}/override`, {
        method: 'POST',
        body: JSON.stringify({
          override_amount: Number(overrideAmount),
          manager_notes: overrideNotes || 'Manager direct override applied.',
        })
      })

      setMessage(res.message || 'Dispute successfully resolved and final settlement confirmed.')
      setOverrideAssessmentId(null)
      setOverrideAmount('')
      setOverrideNotes('')
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to apply manager override.')
    } finally {
      setProcessingOverride(false)
    }
  }

  // Calculate live return preview figures
  const calculateReturnPreview = () => {
    if (!returnRental) return null
    const depVal = Number(returnRental.item?.depreciated_value || 0)
    const replPrice = Number(returnRental.item?.replacement_price || 0)
    const depHeld = Number(returnRental.deposit_held || 0)
    const dueAt = new Date(returnRental.due_at)
    const now = new Date()
    const isOverdue = now > dueAt
    const overdueSeconds = Math.max(0, (now - dueAt) / 1000)
    const overdueDays = overdueSeconds > 60 ? Math.max(1, Math.ceil((overdueSeconds - 60) / 86400)) : 0
    const latePenalty = overdueDays * 500
    const isPresumedLost = forcePresumedLost || overdueDays >= 7

    const selectedType = damageTypes.find(dt => dt.id === Number(damageTypeId))
    const weight = selectedType ? Number(selectedType.weight) : 0.0

    let damageDeduction = 0
    let replacementCharge = 0
    let totalDeduction = 0

    if (isPresumedLost) {
      replacementCharge = replPrice
      totalDeduction = replacementCharge + latePenalty
    } else {
      if (hasDamage && weight > 0) {
        damageDeduction = Math.min(depVal, Math.round(Number(severity) * weight * depVal * 100) / 100)
      }
      totalDeduction = damageDeduction + latePenalty
    }

    const netRefund = Math.max(0, Math.round((depHeld - totalDeduction) * 100) / 100)
    const balanceOwed = Math.max(0, Math.round((totalDeduction - depHeld) * 100) / 100)

    return {
      depVal,
      replPrice,
      depHeld,
      isOverdue,
      overdueDays,
      latePenalty,
      isPresumedLost,
      damageDeduction,
      replacementCharge,
      totalDeduction,
      netRefund,
      balanceOwed,
      selectedTypeName: selectedType ? selectedType.name : 'None',
      weightPercentage: Math.round(weight * 100)
    }
  }

  const preview = calculateReturnPreview()

  const now = new Date()

  // Partition rentals into on-time active field rentals vs overdue/disputed
  const onTimeRentals = activeRentals.filter(r => {
    const isOverdue = r.due_at && new Date(r.due_at) < now
    const isDisputed = (r.status || '').toLowerCase() === 'disputed'
    return !isOverdue && !isDisputed
  })

  const overdueRentals = activeRentals.filter(r => {
    const isOverdue = r.due_at && new Date(r.due_at) < now
    const isDisputed = (r.status || '').toLowerCase() === 'disputed'
    return isOverdue && !isDisputed
  })

  // Filter lists based on search
  const filteredBookings = confirmedBookings.filter(b => {
    const q = search.toLowerCase()
    return (
      b.item?.name?.toLowerCase().includes(q) ||
      b.item?.sku?.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    )
  })

  const filteredOnTimeRentals = onTimeRentals.filter(r => {
    const q = search.toLowerCase()
    return (
      r.item?.name?.toLowerCase().includes(q) ||
      r.item?.sku?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    )
  })

  const filteredOverdueRentals = overdueRentals.filter(r => {
    const q = search.toLowerCase()
    return (
      r.item?.name?.toLowerCase().includes(q) ||
      r.item?.sku?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    )
  })

  const filteredDisputes = disputes.filter(d => {
    const q = search.toLowerCase()
    return (
      d.rental?.item?.name?.toLowerCase().includes(q) ||
      d.rental?.item?.sku?.toLowerCase().includes(q) ||
      String(d.id).includes(q) ||
      d.dispute_reason?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="staff-queue-page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Counter Dispatch & Operations</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Manage counter collection handovers, check in returned equipment with damage assessment, and oversee customer disputes and overdue rentals.
            </p>
          </div>
          <button className="btn secondary sm" onClick={loadData} disabled={loading}>
            🔄 Refresh
          </button>
        </div>

        {message && <div className="notice success" style={{ marginTop: 14 }}>{message}</div>}
        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      {/* Segmented Control Tabs */}
      <div className="payment-tabs" style={{ margin: '0 0 16px', maxWidth: 660 }}>
        <button
          className={`tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          📦 Collection Queue ({confirmedBookings.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'active_rentals' ? 'active' : ''}`}
          onClick={() => setActiveTab('active_rentals')}
        >
          🚚 Active Field Rentals ({onTimeRentals.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'disputes' ? 'active' : ''}`}
          onClick={() => setActiveTab('disputes')}
        >
          ⚠️ Disputes & Overdues ({disputes.length + overdueRentals.length})
        </button>
      </div>

      {/* Search filter */}
      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${
            activeTab === 'confirmed'
              ? 'collection queue'
              : activeTab === 'active_rentals'
              ? 'active on-time rentals'
              : 'disputes and overdue rentals'
          } by equipment, SKU, or ID...`}
        />
      </div>

      {/* 1. Confirmed Bookings Tab */}
      {activeTab === 'confirmed' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Orders Awaiting Collection</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                Deposit is secured. Verify physical condition with client and authorize dispatch.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading collection queue…</div>
          ) : filteredBookings.length === 0 ? (
            <div className="empty">No orders currently awaiting counter collection.</div>
          ) : (
            filteredBookings.map(b => (
              <div key={b.id} className="booking-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{b.item?.name}</strong>
                    {b.item?.sku && <span className="badge" style={{ fontSize: 11 }}>{b.item.sku}</span>}
                    <span className="badge available">● Deposit Confirmed</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    Collection: {formatTime(b.start_ts)} → Due: {formatTime(b.end_ts)}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Order #{b.id} • {b.rental_price ? `Rental: ₹${b.rental_price.toLocaleString('en-IN')} (${b.duration_days}d) • ` : ''}Deposit: ₹{b.deposit_amount?.toLocaleString('en-IN')}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    className="btn"
                    onClick={() => {
                      setHandoverBooking(b)
                      setMessage('')
                      setError('')
                    }}
                  >
                    Authorize Dispatch
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 2. Active Rentals Tab (On-Time Rentals Only) */}
      {activeTab === 'active_rentals' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Active Field Rentals ({onTimeRentals.length})</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                On-time equipment currently in active client possession. (Overdue items and contested returns are moved to Disputes & Overdues).
              </p>
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading active rentals…</div>
          ) : filteredOnTimeRentals.length === 0 ? (
            <div className="empty">No on-time equipment currently deployed in the field.</div>
          ) : (
            filteredOnTimeRentals.map(r => (
              <div key={r.id} className="booking-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{r.item?.name || `Item #${r.item_id}`}</strong>
                    {r.item?.sku && <span className="badge">{r.item.sku}</span>}
                    <span className="badge available">● Active (On Schedule)</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    Dispatched: {formatTime(r.checkout_at)} → Due: {formatTime(r.due_at)}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Rental #{r.id} • {r.total_price ? `Fee: ₹${r.total_price.toLocaleString('en-IN')} • ` : ''}Deposit Held: ₹{r.deposit_held?.toLocaleString('en-IN') || 0}
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn sm"
                      onClick={() => {
                        setReturnRental(r)
                        setHasDamage(false)
                        setSeverity(1)
                        setReturnNotes('')
                        setReturnPhotoUrl('')
                        setForcePresumedLost(false)
                        setMessage('')
                        setError('')
                      }}
                    >
                      📥 Process Return
                    </button>
                    <button
                      className="btn secondary sm"
                      onClick={() => setSelectedAgreementData({
                        rentalId: r.id,
                        bookingId: r.booking_id,
                        item: r.item,
                        startTs: r.checkout_at,
                        endTs: r.due_at,
                        checkoutAt: r.checkout_at,
                        pricing: {
                          rental_price: r.total_price,
                          depreciated_value: r.item?.depreciated_value,
                          duration_tier: 'Daily Tier',
                          duration_days: Math.max(1, Math.ceil((new Date(r.due_at) - new Date(r.checkout_at)) / 86400000)),
                        },
                        depositAmount: r.deposit_held,
                        conditionNotes: 'Verified during counter collection inspection.',
                        customer: { id: r.customer_id },
                      })}
                    >
                      📄 Agreement
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. Disputes & Overdues Tab */}
      {activeTab === 'disputes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Disputes & Overdue Rentals</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                Track overdue equipment accumulating late fees, check in late returns, and manage customer contested damage assessments.
              </p>
            </div>
          </div>

          {/* Section A: Overdue Field Rentals */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 16, color: '#b45309' }}>
                ⏰ Overdue Field Rentals ({overdueRentals.length})
              </h4>
              <span className="badge held" style={{ fontSize: 11 }}>
                Incurring ₹500/day Late Penalty
              </span>
            </div>

            {filteredOverdueRentals.length === 0 ? (
              <div className="empty" style={{ margin: '8px 0 20px', padding: '14px', background: '#f8fafc', borderRadius: 8 }}>
                No equipment is currently overdue. All active rentals are on schedule.
              </div>
            ) : (
              filteredOverdueRentals.map(r => {
                const dueAt = new Date(r.due_at)
                const overdueSeconds = Math.max(0, (now - dueAt) / 1000)
                const overdueDays = overdueSeconds > 60 ? Math.max(1, Math.ceil((overdueSeconds - 60) / 86400)) : 0
                const latePenalty = overdueDays * 500

                return (
                  <div
                    key={r.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      borderLeft: '5px solid #dc2626',
                      borderRadius: '10px',
                      padding: '16px 20px',
                      marginBottom: '14px',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 16 }}>{r.item?.name || `Item #${r.item_id}`}</strong>
                        {r.item?.sku && <span className="badge">{r.item.sku}</span>}
                        <span className="badge unavailable">
                          ⚠️ {overdueDays} Day{overdueDays === 1 ? '' : 's'} Overdue
                        </span>
                      </div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        Dispatched: {formatTime(r.checkout_at)} → <strong style={{ color: '#dc2626' }}>Scheduled Due: {formatTime(r.due_at)}</strong>
                      </div>
                      <div className="small" style={{ marginTop: 4, color: '#991b1b', fontWeight: 500 }}>
                        Accrued Late Penalty: ₹{latePenalty.toLocaleString('en-IN')} (₹500/day for {overdueDays}d) • Deposit Held: ₹{r.deposit_held?.toLocaleString('en-IN') || 0}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn sm"
                          style={{ background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' }}
                          onClick={() => {
                            setReturnRental(r)
                            setHasDamage(false)
                            setSeverity(1)
                            setReturnNotes(`Late return processed. Incurred ${overdueDays} days overdue fee.`)
                            setReturnPhotoUrl('')
                            setForcePresumedLost(false)
                            setMessage('')
                            setError('')
                          }}
                        >
                          📥 Check-in & Assess Penalty
                        </button>
                        <button
                          className="btn secondary sm"
                          onClick={() => setSelectedAgreementData({
                            rentalId: r.id,
                            bookingId: r.booking_id,
                            item: r.item,
                            startTs: r.checkout_at,
                            endTs: r.due_at,
                            checkoutAt: r.checkout_at,
                            pricing: {
                              rental_price: r.total_price,
                              depreciated_value: r.item?.depreciated_value,
                              duration_tier: 'Daily Tier',
                              duration_days: Math.max(1, Math.ceil((new Date(r.due_at) - new Date(r.checkout_at)) / 86400000)),
                            },
                            depositAmount: r.deposit_held,
                            conditionNotes: 'Verified during counter collection inspection.',
                            customer: { id: r.customer_id },
                          })}
                        >
                          📄 Agreement
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <hr style={{ margin: '24px 0', borderColor: 'var(--card-border)' }} />

          {/* Section B: Contested Damage Assessments & Manager Overrides */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 16 }}>
                ⚖️ Contested Damage Assessments ({disputes.length})
              </h4>
              <span className="badge disputed" style={{ fontSize: 11 }}>
                Manager Review Required (BR3)
              </span>
            </div>

          {loading ? (
            <div className="empty">Loading customer disputes…</div>
          ) : filteredDisputes.length === 0 ? (
            <div className="empty">No active damage assessment disputes on file.</div>
          ) : (
            filteredDisputes.map(d => (
              <div key={d.id} className="dispute-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 17 }}>
                      {d.rental?.item?.name || 'Equipment Rental'}
                    </h4>
                    <p className="small muted" style={{ margin: '2px 0 6px' }}>
                      Rental #{d.rental_id} • Disputed on {formatTime(d.disputed_at)}
                    </p>
                  </div>
                  <span className="badge disputed">⚠️ Customer Disputed</span>
                </div>

                {/* Dispute rationale */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', margin: '10px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                    CUSTOMER DISPUTE STATEMENT:
                  </div>
                  <div style={{ fontSize: 14, color: '#78350f' }}>
                    "{d.dispute_reason}"
                  </div>
                </div>

                {/* Original Assessment details */}
                <div className="meta-box" style={{ margin: '10px 0' }}>
                  <div className="meta-row">
                    <span className="muted">Damage Classification:</span>
                    <strong>{d.damage_type?.name || 'Damage Assessed'} (Severity Level {d.severity}/5)</strong>
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

                {/* Manager override action: strictly restricted to Manager role */}
                {getUser()?.role?.toLowerCase() === 'manager' ? (
                  overrideAssessmentId === d.id ? (
                    <form onSubmit={(e) => handleOverrideSubmit(e, d.id)} style={{ marginTop: 14, background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--accent)' }}>
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
                          placeholder="Enter adjusted deduction amount (e.g. 2000)"
                          required
                        />
                      </div>
                      <div className="form-row">
                        <label>Manager Resolution Notes</label>
                        <textarea
                          rows={2}
                          value={overrideNotes}
                          onChange={e => setOverrideNotes(e.target.value)}
                          placeholder="State business rationale for this deduction override..."
                          required
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                        <button type="submit" className="btn sm" disabled={processingOverride}>
                          {processingOverride ? 'Settling…' : 'Confirm Override & Close Rental'}
                        </button>
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => setOverrideAssessmentId(null)}
                          disabled={processingOverride}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ textAlign: 'right', marginTop: 12 }}>
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          setOverrideAssessmentId(d.id)
                          setOverrideAmount(d.damage_deduction)
                          setOverrideNotes('')
                        }}
                      >
                        ⚖️ Override Deduction
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: 'right', marginTop: 12 }}>
                    <span className="muted small" style={{ fontStyle: 'italic', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>
                      🔒 Manager authorization required to apply deduction override.
                    </span>
                  </div>
                )}

              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* Handover Modal / Panel */}
      {handoverBooking && (
        <div className="card" style={{ border: '1px solid var(--accent)', marginTop: 24, boxShadow: '0 8px 30px rgba(0, 113, 227, 0.12)' }}>
          <h3>Equipment Dispatch — Order #{handoverBooking.id}</h3>
          <p className="small muted">
            Asset: <strong>{handoverBooking.item?.name}</strong> (SKU: {handoverBooking.item?.sku || 'N/A'})
          </p>

          <form onSubmit={handleHandoverSubmit} style={{ marginTop: 16 }}>
            <div className="meta-box">
              <div className="meta-row">
                <span className="muted">Rental Period:</span>
                <strong>{formatTime(handoverBooking.start_ts)} → {formatTime(handoverBooking.end_ts)}</strong>
              </div>
              {handoverBooking.rental_price && (
                <div className="meta-row">
                  <span className="muted">Rental Charge ({handoverBooking.duration_days}d):</span>
                  <strong>₹{handoverBooking.rental_price.toLocaleString('en-IN')}</strong>
                </div>
              )}
              <div className="meta-row">
                <span className="muted">Deposit Confirmed:</span>
                <strong style={{ color: 'var(--accent)' }}>₹{handoverBooking.deposit_amount?.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            {/* Pre-Rental Condition Logging Checkbox */}
            <div style={{ margin: '16px 0 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={showConditionLog}
                  onChange={e => setShowConditionLog(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Log Pre-Dispatch Condition Inspection Checklist (Optional)
              </label>
            </div>

            {showConditionLog && (
              <div className="meta-box" style={{ marginBottom: 16 }}>
                <div className="form-row">
                  <label>Inspection Notes</label>
                  <textarea
                    rows={2}
                    value={conditionNotes}
                    onChange={e => setConditionNotes(e.target.value)}
                    placeholder="Enter pre-dispatch hardware inspection notes..."
                  />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Inspection Photo Reference URL</label>
                  <input
                    type="text"
                    value={photoUrl}
                    onChange={e => setPhotoUrl(e.target.value)}
                    placeholder="https://example.com/photos/item-condition.jpg"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn"
                disabled={processingHandover}
                style={{ flex: 1 }}
              >
                {processingHandover ? 'Dispatching Gear…' : 'Authorize Handover & Dispatch'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelectedAgreementData({
                  bookingId: handoverBooking.id,
                  item: handoverBooking.item,
                  startTs: handoverBooking.start_ts,
                  endTs: handoverBooking.end_ts,
                  checkoutAt: new Date().toISOString(),
                  pricing: handoverBooking.pricing,
                  depositAmount: handoverBooking.deposit_amount,
                  conditionNotes: showConditionLog ? conditionNotes : 'Standard pre-dispatch hardware verification.',
                  photoUrl: showConditionLog ? photoUrl : null,
                  customer: { id: handoverBooking.customer_id },
                })}
                disabled={processingHandover}
              >
                📄 Preview Agreement
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setHandoverBooking(null)}
                disabled={processingHandover}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Return & Damage Modal (Increment 4) */}
      {returnRental && preview && (
        <div className="card" style={{ border: '1px solid #ff7043', marginTop: 24, boxShadow: '0 8px 30px rgba(255, 112, 67, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3>Equipment Check-In & Damage Assessment</h3>
              <p className="small muted">
                Rental #{returnRental.id} • Asset: <strong>{returnRental.item?.name}</strong> (SKU: {returnRental.item?.sku || 'N/A'})
              </p>
            </div>
            <span className={`badge ${preview.isOverdue ? 'unavailable' : 'available'}`}>
              {preview.isOverdue ? `⚠️ ${preview.overdueDays} Days Overdue` : '● On Time Return'}
            </span>
          </div>

          <form onSubmit={handleReturnSubmit} style={{ marginTop: 16 }}>
            {/* Rental Timeline & Values */}
            <div className="meta-box">
              <div className="meta-row">
                <span className="muted">Dispatched Date:</span>
                <strong>{formatTime(returnRental.checkout_at)}</strong>
              </div>
              <div className="meta-row">
                <span className="muted">Due Date:</span>
                <strong>{formatTime(returnRental.due_at)}</strong>
              </div>
              <div className="meta-row">
                <span className="muted">Depreciated Asset Value:</span>
                <strong>₹{preview.depVal.toLocaleString('en-IN')}</strong>
              </div>
              <div className="meta-row">
                <span className="muted">Security Deposit Held:</span>
                <strong style={{ color: 'var(--accent)' }}>₹{preview.depHeld.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            {/* Structured Pre- vs Post-Rental Condition Comparison (FR016) */}
            <div className="inspection-split-grid">
              {/* Left: Pre-Rental Handover Baseline */}
              <div className="inspection-column">
                <div className="inspection-header" style={{ color: '#0369a1' }}>
                  <span>📸 1. Pre-Rental Handover Baseline</span>
                  <span className="badge available">Handover</span>
                </div>
                
                <div className="condition-photo-box">
                  {returnRental.pre_rental_condition?.photo_url ? (
                    <img
                      src={returnRental.pre_rental_condition.photo_url}
                      alt="Pre-rental condition baseline"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="condition-photo-placeholder">
                      <span>📷</span>
                      <span>No pre-rental photo logged</span>
                    </div>
                  )}
                </div>

                <div className="small muted" style={{ marginBottom: 4, fontWeight: 600 }}>
                  Handover Condition Notes:
                </div>
                <div style={{ fontSize: 13, color: '#334155', background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', minHeight: 52 }}>
                  {returnRental.pre_rental_condition?.notes || 'Standard dispatch inspection recorded — all accessories & caps included.'}
                </div>
                <div className="small muted" style={{ marginTop: 6, fontSize: 11 }}>
                  Logged at: {formatTime(returnRental.pre_rental_condition?.captured_at || returnRental.checkout_at)}
                </div>
              </div>

              {/* Right: Post-Rental Return Inspection */}
              <div className="inspection-column">
                <div className="inspection-header" style={{ color: '#b45309' }}>
                  <span>🔍 2. Post-Rental Return Check</span>
                  <span className="badge pending">Check-in</span>
                </div>

                <div className="form-row" style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12 }}>Post-Return Photo Reference URL</label>
                  <input
                    type="text"
                    value={returnPhotoUrl}
                    onChange={e => setReturnPhotoUrl(e.target.value)}
                    placeholder="https://example.com/photos/return-inspection.jpg"
                    style={{ fontSize: 13 }}
                  />
                </div>

                {returnPhotoUrl && (
                  <div className="condition-photo-box" style={{ height: 110, marginBottom: 10 }}>
                    <img
                      src={returnPhotoUrl}
                      alt="Post-return inspection"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                )}

                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>Post-Rental Inspection Notes</label>
                  <textarea
                    rows={3}
                    value={returnNotes}
                    onChange={e => setReturnNotes(e.target.value)}
                    placeholder="Examine glass, mount, buttons, and accessories against handover baseline..."
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            </div>

            {/* Damage Evaluation Section */}
            <div style={{ margin: '14px 0', padding: 14, background: '#fff', borderRadius: 12, border: '1px solid var(--card-border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={hasDamage}
                  onChange={e => setHasDamage(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Identify Damage or Missing Components (Trigger Algorithmic Deduction)
              </label>

              {hasDamage && (
                <div style={{ marginTop: 14 }}>
                  <div className="form-row">
                    <label>Damage Classification (FR017)</label>
                    <select
                      value={damageTypeId}
                      onChange={e => setDamageTypeId(e.target.value)}
                    >
                      {damageTypes.map(dt => (
                        <option key={dt.id} value={dt.id}>
                          {dt.name} — {Math.round(dt.weight * 100)}% base rate ({dt.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <label style={{ marginBottom: 4, display: 'block' }}>
                      Severity Score (1 to 5) — FR018
                    </label>
                    <div className="severity-selector">
                      {[1, 2, 3, 4, 5].map(score => {
                        const labels = ['1 (Negligible)', '2 (Minor)', '3 (Moderate)', '4 (Serious)', '5 (Critical)']
                        return (
                          <button
                            type="button"
                            key={score}
                            className={`severity-pill ${severity === score ? 'active' : ''}`}
                            onClick={() => setSeverity(score)}
                          >
                            {labels[score - 1]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Presumed Lost escalation (FR023) */}
            <div style={{ margin: '10px 0 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#991b1b' }}>
                <input
                  type="checkbox"
                  checked={forcePresumedLost}
                  onChange={e => setForcePresumedLost(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Force Escalate to "Presumed Lost" (Charge full replacement value ₹{preview.replPrice.toLocaleString('en-IN')})
              </label>
            </div>

            {/* Live Financial Reconciliation Card */}
            <div className="return-preview-box">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--text-primary)' }}>
                Deposit Reconciliation Breakdown
              </div>
              <div className="return-preview-row">
                <span className="muted">Security Deposit Held:</span>
                <span>₹{preview.depHeld.toLocaleString('en-IN')}</span>
              </div>
              {preview.latePenalty > 0 && (
                <div className="return-preview-row">
                  <span className="muted">Late Penalty ({preview.overdueDays}d @ ₹500/day):</span>
                  <span style={{ color: '#c9251d' }}>- ₹{preview.latePenalty.toLocaleString('en-IN')}</span>
                </div>
              )}
              {hasDamage && !preview.isPresumedLost && (
                <div className="return-preview-row">
                  <span className="muted">Damage Deduction ({preview.selectedTypeName} Lv.{severity}):</span>
                  <span style={{ color: '#c9251d' }}>- ₹{preview.damageDeduction.toLocaleString('en-IN')}</span>
                </div>
              )}
              {preview.isPresumedLost && (
                <div className="return-preview-row">
                  <span className="muted">Replacement Charge (Presumed Lost):</span>
                  <span style={{ color: '#c9251d' }}>- ₹{preview.replacementCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="return-preview-row">
                <span>Total Deductions:</span>
                <span style={{ color: '#c9251d' }}>₹{preview.totalDeduction.toLocaleString('en-IN')}</span>
              </div>
              <div className="return-preview-row">
                <span style={{ color: '#107c10' }}>Net Deposit Refund to Customer:</span>
                <span style={{ color: '#107c10' }}>₹{preview.netRefund.toLocaleString('en-IN')}</span>
              </div>
              {preview.balanceOwed > 0 && (
                <div className="return-preview-row">
                  <span style={{ color: '#c9251d' }}>Outstanding Customer Balance:</span>
                  <span style={{ color: '#c9251d' }}>₹{preview.balanceOwed.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn"
                disabled={processingReturn}
                style={{ flex: 1 }}
              >
                {processingReturn ? 'Processing Settlement…' : `Confirm Return & Refund ₹${preview.netRefund.toLocaleString('en-IN')}`}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setReturnRental(null)}
                disabled={processingReturn}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Digital Rental Agreement Modal */}
      <RentalAgreementModal
        isOpen={Boolean(selectedAgreementData)}
        onClose={() => setSelectedAgreementData(null)}
        data={selectedAgreementData}
      />
    </div>
  )
}
