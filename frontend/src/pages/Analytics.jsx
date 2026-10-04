import React, { useEffect, useState } from 'react'
import { api, getToken, API_URL } from '../lib/api'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const loadAnalytics = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api('/manager/analytics')
      setData(res)
    } catch (err) {
      setError(err.message || 'Failed to load manager analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [])

  const handleExportCsv = async () => {
    setExporting(true)
    try {
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

  // Chart 1: Most Rented Equipment (Bar)
  const mostRentedChartData = {
    labels: mostRented.slice(0, 6).map(i => (i.name.length > 18 ? i.name.slice(0, 16) + '…' : i.name)),
    datasets: [
      {
        label: 'Times Rented',
        data: mostRented.slice(0, 6).map(i => i.rental_count),
        backgroundColor: 'rgba(0, 113, 227, 0.75)',
        borderColor: 'rgb(0, 113, 227)',
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.raw} rentals completed`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0, stepSize: 1 },
      },
    },
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
      },
    ],
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
    },
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
      },
    ],
  }

  return (
    <div className="analytics-page">
      {/* Header & Export CTA */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h2>Operations & Analytics Dashboard</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Track business revenue, visual trends, and equipment performance.
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
          <div className="charts-grid" style={{ marginTop: 24 }}>
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
                      {mostRented.map(item => (
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
        </>
      )}
    </div>
  )
}
