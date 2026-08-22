import React from 'react'

const formatTime = value => {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function RentalAgreementModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null

  const {
    bookingId,
    rentalId,
    customer,
    item,
    startTs,
    endTs,
    checkoutAt,
    pricing,
    depositAmount,
    conditionNotes,
    photoUrl,
    paymentStatus,
    paymentProvider,
  } = data

  const agreementRef = `GV-AGR-${bookingId || '000'}-${(rentalId || '000')}`
  const todayStr = new Date().toLocaleDateString(undefined, { dateStyle: 'long' })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content agreement-modal" onClick={e => e.stopPropagation()}>
        {/* Action Header */}
        <div className="agreement-actions no-print">
          <button className="btn secondary" onClick={handlePrint}>
            🖨️ Print / Save PDF
          </button>
          <button className="btn secondary" onClick={onClose} style={{ marginLeft: 8 }}>
            ✕ Close
          </button>
        </div>

        {/* Official Document Container */}
        <div className="agreement-document">
          {/* Header */}
          <div className="agreement-header">
            <div className="brand-header">
              <h2>GEARVAULT</h2>
              <span className="doc-type">EQUIPMENT RENTAL AGREEMENT & CHECKLIST</span>
            </div>
            <div className="doc-meta">
              <div><strong>Agreement Ref:</strong> {agreementRef}</div>
              <div><strong>Issue Date:</strong> {todayStr}</div>
              <div><strong>Status:</strong> {rentalId ? 'Active Rental' : 'Confirmed Booking'}</div>
            </div>
          </div>

          <hr className="divider" />

          {/* Section 1: Parties */}
          <div className="doc-section">
            <h4>1. PARTIES & RESERVATION DETAILS</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Renter (Customer):</strong> {customer?.full_name || customer?.email || 'Registered Customer'}</p>
                <p><strong>Customer ID:</strong> {customer?.id || 'N/A'}</p>
                <p><strong>Contact Email:</strong> {customer?.email || 'N/A'}</p>
              </div>
              <div>
                <p><strong>Rental Provider:</strong> GearVault Operations Hub</p>
                <p><strong>Booking Reference:</strong> #{bookingId || 'N/A'}</p>
                {rentalId && <p><strong>Rental Record:</strong> #{rentalId}</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Equipment & Pre-Rental Condition Inspection */}
          <div className="doc-section">
            <h4>2. EQUIPMENT SPECIFICATIONS & CONDITION CHECKLIST (FR013 / FR014)</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Equipment Name:</strong> {item?.name || 'N/A'}</p>
                <p><strong>Inventory SKU:</strong> {item?.sku || 'N/A'}</p>
                <p><strong>Category:</strong> {item?.category?.name || 'General'}</p>
              </div>
              <div>
                <p><strong>Original Purchase Price:</strong> ₹{item?.purchase_price?.toLocaleString('en-IN') || '0'}</p>
                <p><strong>Replacement Value:</strong> ₹{item?.replacement_price?.toLocaleString('en-IN') || '0'}</p>
                <p><strong>Depreciated Worth (Vdep):</strong> ₹{(pricing?.depreciated_value || item?.depreciated_value || item?.purchase_price)?.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="condition-box">
              <p><strong>Pre-Rental Inspection Notes:</strong></p>
              <p className="condition-text">{conditionNotes || 'Standard pre-handover physical and electronic functional verification completed. All accessories, caps, and batteries checked.'}</p>
              {photoUrl && (
                <p className="small muted" style={{ marginTop: 4 }}>
                  📷 Pre-Rental Photo Reference Logged: <a href={photoUrl} target="_blank" rel="noreferrer" className="inline-link">{photoUrl}</a>
                </p>
              )}
            </div>
          </div>

          {/* Section 3: Rental Timeline */}
          <div className="doc-section">
            <h4>3. RENTAL TIMELINE & RETURN SCHEDULE</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Handover / Start Time:</strong> {formatTime(checkoutAt || startTs)}</p>
                <p><strong>Return Due Date:</strong> <span style={{ color: '#c2410c', fontWeight: 600 }}>{formatTime(endTs)}</span></p>
              </div>
              <div>
                <p><strong>Billable Duration:</strong> {pricing?.duration_days || 1} Day(s)</p>
                <p><strong>Pricing Tier Applied:</strong> {pricing?.duration_tier || 'Daily'} Tier Multiplier</p>
              </div>
            </div>
          </div>

          {/* Section 4: Financial Breakdown */}
          <div className="doc-section">
            <h4>4. FINANCIAL BREAKDOWN & DEPOSIT TERMS</h4>
            <table className="agreement-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Calculation Basis</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Dynamic Rental Charges</td>
                  <td>{pricing?.duration_days || 1} day(s) @ {pricing?.duration_tier || 'Daily'} Tier (Depreciated Value × Multiplier)</td>
                  <td style={{ textAlign: 'right' }}>₹{(pricing?.rental_price || 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td>Refundable Security Deposit</td>
                  <td>20% of Current Depreciated Valuation (Collateral against damage/late return)</td>
                  <td style={{ textAlign: 'right' }}>₹{(depositAmount || pricing?.deposit_amount || 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr className="highlight-row">
                  <td><strong>Total Security Deposit Paid</strong></td>
                  <td>Confirmed via {paymentProvider || 'Simulated Payment Gateway'}</td>
                  <td style={{ textAlign: 'right' }}><strong>₹{(depositAmount || pricing?.deposit_amount || 0).toLocaleString('en-IN')}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 5: Binding Terms & Legal Business Rules */}
          <div className="doc-section">
            <h4>5. TERMS OF SERVICE & BINDING BUSINESS RULES</h4>
            <ol className="terms-list">
              <li>
                <strong>Late Return Penalty (BR4 / FR022):</strong> Equipment must be returned to the counter on or before the Return Due Date. Overdue rentals incur a mandatory flat daily penalty for each day past due. Staff cannot waive penalties without Manager authorization.
              </li>
              <li>
                <strong>Presumed Lost Escalation (FR023):</strong> Equipment remaining unreturned past 7 days overdue is escalated to "Presumed Lost" status, and the customer is liable for the full replacement value (₹{item?.replacement_price?.toLocaleString('en-IN') || '0'}).
              </li>
              <li>
                <strong>Damage Assessment & Deposit Deductions (FR018):</strong> Upon return, the equipment is inspected against pre-rental condition. Any damage is categorized (Cosmetic, Functional, or Major Loss) and scored (1–5). Deductions are calculated automatically and deducted from the deposit.
              </li>
              <li>
                <strong>Dispute Rights (BR3 / FR019 / FR020):</strong> The customer has the right to dispute damage assessments. Disputed deductions are reviewed and finalized directly by the Store Manager.
              </li>
            </ol>
          </div>

          {/* Section 6: Digital Signature & Acceptance */}
          <div className="doc-section signatures-section">
            <div className="grid-2-col">
              <div className="signature-box">
                <p className="small muted">Customer Digital Acknowledgment:</p>
                <div className="sig-stamp">
                  ✓ DIGITALLY ACCEPTED & CONFIRMED<br />
                  <span className="small">{customer?.email || 'Customer'} • {todayStr}</span>
                </div>
              </div>
              <div className="signature-box">
                <p className="small muted">Authorized Rental Desk Officer:</p>
                <div className="sig-stamp staff-stamp">
                  ✓ VERIFIED & ISSUED<br />
                  <span className="small">GearVault Desk Operations • Station #01</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
