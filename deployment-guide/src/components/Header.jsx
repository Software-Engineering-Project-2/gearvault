import React from 'react'
import { Rocket, Layers, RotateCcw, Download, CheckCircle2 } from 'lucide-react'

export default function Header({
  totalTasks,
  completedTasksCount,
  onOpenArchitecture,
  onResetProgress,
  onExportProgress
}) {
  const percentComplete = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0

  return (
    <header className="aws-header-container">
      {/* 1. Global Dark Top Navigation Bar */}
      <nav className="aws-top-nav">
        <div className="aws-brand-group">
          <div className="aws-brand-logo">
            <span className="aws-brand-name">GEARVAULT</span>
            <span className="aws-brand-divider">/</span>
            <span className="aws-brand-sub">Cloud Deployment Guide</span>
          </div>
          <span className="aws-badge-pill">
            <Rocket size={12} style={{ display: 'inline', marginRight: '4px' }} />
            16 AWS SERVICES • PRODUCTION RUNBOOK
          </span>
        </div>

        <div className="aws-top-actions">
          <button className="aws-btn-nav" onClick={onOpenArchitecture} title="View AWS Architecture Blueprint">
            <Layers size={14} color="#FF9900" />
            <span>Architecture Blueprint</span>
          </button>
          <button className="aws-btn-nav" onClick={onExportProgress} title="Export progress as JSON">
            <Download size={14} color="#0073BB" />
            <span>Export Progress</span>
          </button>
          <button className="aws-btn-nav aws-btn-nav-danger" onClick={onResetProgress} title="Reset all checkboxes">
            <RotateCcw size={14} color="#D13212" />
            <span>Reset</span>
          </button>
        </div>
      </nav>

      {/* 2. AWS Skill Builder Lesson Hero */}
      <div className="aws-hero-banner">
        <div className="aws-hero-content">
          <div className="aws-hero-tag">
            COURSE MODULE • BATTLE-TESTED ENTERPRISE RUNBOOK
          </div>
          <h1 className="aws-hero-title">GearVault AWS Cloud Deployment Command Center</h1>
          <p className="aws-hero-desc">
            An interactive, bug-free production training portal for deploying the complete GearVault rental stack to Amazon Web Services using 16 distinct cloud-native services.
          </p>

          {/* Progress / Context row */}
          <div className="aws-hero-progress-box">
            <div className="aws-hero-progress-header">
              <span className="aws-hero-progress-label">
                <CheckCircle2 size={15} color="#FF9900" />
                <span>Overall Deployment Completion</span>
              </span>
              <span className="aws-hero-progress-pct">{percentComplete}%</span>
            </div>
            <div className="aws-hero-track">
              <div className="aws-hero-bar" style={{ width: `${percentComplete}%` }} />
            </div>

            <div className="aws-hero-stats">
              <div className="aws-stat-item">
                <div className="aws-stat-val">{completedTasksCount} / {totalTasks}</div>
                <div className="aws-stat-lbl">Tasks Completed</div>
              </div>
              <div className="aws-stat-item">
                <div className="aws-stat-val">12</div>
                <div className="aws-stat-lbl">Phases / Modules</div>
              </div>
              <div className="aws-stat-item">
                <div className="aws-stat-val">16</div>
                <div className="aws-stat-lbl">Distinct AWS Services</div>
              </div>
              <div className="aws-stat-item">
                <div className="aws-stat-val">ap-south-1</div>
                <div className="aws-stat-lbl">Primary Region</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
