import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import ConfigBar from './components/ConfigBar'
import ResourceScorecard from './components/ResourceScorecard'
import ControlsBar from './components/ControlsBar'
import PhaseCard from './components/PhaseCard'
import ArchitectureModal from './components/ArchitectureModal'
import { PHASES, AWS_RESOURCES } from './data/phasesData'

const DEFAULT_CONFIG = {
  region: 'ap-south-1',
  domain: 'gearvault.example.com',
  originVerifyHeader: 'GearVaultOriginSecret2026',
  mediaBucket: 'gearvault-media-apsouth1',
  frontendBucket: 'gearvault-frontend-apsouth1',
  dbUser: 'gearvault_admin',
  dbPassword: 'GearVaultSecurePass2026!'
}

export default function App() {
  // Load persisted completed tasks from localStorage
  const [completedTaskIds, setCompletedTaskIds] = useState(() => {
    try {
      const saved = localStorage.getItem('gearvault_aws_completed_tasks')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Load custom deployment variables from localStorage
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('gearvault_aws_deployment_config')
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG
    } catch {
      return DEFAULT_CONFIG
    }
  })

  // View mode: 'cli', 'console', or 'both'
  const [globalMode, setGlobalMode] = useState(() => {
    return localStorage.getItem('gearvault_aws_view_mode') || 'both'
  })

  // Open phases state (all open by default)
  const [openPhases, setOpenPhases] = useState(() => {
    const initial = {}
    PHASES.forEach(p => { initial[p.id] = true })
    return initial
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedResource, setSelectedResource] = useState(null)
  const [isArchModalOpen, setIsArchModalOpen] = useState(false)

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('gearvault_aws_completed_tasks', JSON.stringify(completedTaskIds))
  }, [completedTaskIds])

  useEffect(() => {
    localStorage.setItem('gearvault_aws_deployment_config', JSON.stringify(config))
  }, [config])

  useEffect(() => {
    localStorage.setItem('gearvault_aws_view_mode', globalMode)
  }, [globalMode])

  // Count total tasks across all phases
  const totalTasks = PHASES.reduce((acc, p) => acc + p.tasks.length, 0)

  // Toggle individual task
  const handleToggleTask = (taskId) => {
    setCompletedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    )
  }

  // Mark all tasks in a phase complete or incomplete
  const handleMarkAllInPhase = (phaseId, complete) => {
    const phase = PHASES.find(p => p.id === phaseId)
    if (!phase) return
    const phaseTaskIds = phase.tasks.map(t => t.id)
    if (complete) {
      setCompletedTaskIds(prev => Array.from(new Set([...prev, ...phaseTaskIds])))
    } else {
      setCompletedTaskIds(prev => prev.filter(id => !phaseTaskIds.includes(id)))
    }
  }

  // Reset all progress
  const handleResetProgress = () => {
    if (window.confirm('Are you sure you want to reset all checklist progress?')) {
      setCompletedTaskIds([])
    }
  }

  // Export progress as JSON file
  const handleExportProgress = () => {
    const exportData = {
      project: 'GearVault AWS Deployment',
      timestamp: new Date().toISOString(),
      region: config.region,
      completedTasksCount: completedTaskIds.length,
      totalTasks,
      completedTaskIds,
      config
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gearvault-aws-deployment-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Toggle open state for a phase
  const handleTogglePhaseOpen = (phaseId) => {
    setOpenPhases(prev => ({ ...prev, [phaseId]: !prev[phaseId] }))
  }

  // Expand or collapse all phases
  const allExpanded = Object.values(openPhases).every(Boolean)
  const handleToggleExpandAll = () => {
    const nextState = !allExpanded
    const updated = {}
    PHASES.forEach(p => { updated[p.id] = nextState })
    setOpenPhases(updated)
  }

  return (
    <div className="aws-app-root">
      <Header
        totalTasks={totalTasks}
        completedTasksCount={completedTaskIds.length}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
        onResetProgress={handleResetProgress}
        onExportProgress={handleExportProgress}
      />

      <div className="aws-layout-shell">
        {/* Persistent Course Navigation Sidebar */}
        <aside className="aws-sidebar">
          <div className="aws-sidebar-header">
            <div className="aws-sidebar-title">COURSE MODULES</div>
            <div className="aws-sidebar-meta">
              <span>{completedTaskIds.length} of {totalTasks} completed</span>
              <span className="aws-sidebar-pct">
                {totalTasks > 0 ? Math.round((completedTaskIds.length / totalTasks) * 100) : 0}%
              </span>
            </div>
            <div className="aws-sidebar-progress-track">
              <div
                className="aws-sidebar-progress-fill"
                style={{
                  width: `${totalTasks > 0 ? Math.round((completedTaskIds.length / totalTasks) * 100) : 0}%`
                }}
              />
            </div>
          </div>

          <div className="aws-sidebar-nav">
            {PHASES.map((phase) => {
              const totalInPhase = phase.tasks.length
              const doneInPhase = phase.tasks.filter(t => completedTaskIds.includes(t.id)).length
              const isDone = doneInPhase === totalInPhase && totalInPhase > 0
              const isOpen = !!openPhases[phase.id]

              return (
                <button
                  key={phase.id}
                  className={`aws-sidebar-row ${isOpen ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                  onClick={() => {
                    handleTogglePhaseOpen(phase.id)
                    const el = document.getElementById(phase.id)
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                  title={`Phase ${phase.number}: ${phase.title}`}
                >
                  <div className="aws-sidebar-row-indicator">
                    {isDone ? (
                      <span className="aws-indicator-done">✓</span>
                    ) : (
                      <span className="aws-indicator-num">{phase.number}</span>
                    )}
                  </div>
                  <div className="aws-sidebar-row-info">
                    <div className="aws-sidebar-row-name">Phase {phase.number}: {phase.title}</div>
                    <div className="aws-sidebar-row-count">{doneInPhase}/{totalInPhase} tasks done</div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="aws-main-content">
          <ConfigBar
            config={config}
            setConfig={setConfig}
            onResetDefaults={() => setConfig(DEFAULT_CONFIG)}
          />

          <ResourceScorecard
            completedTaskIds={completedTaskIds}
            phases={PHASES}
            selectedResource={selectedResource}
            onSelectResource={setSelectedResource}
          />

          <ControlsBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            globalMode={globalMode}
            setGlobalMode={setGlobalMode}
            allExpanded={allExpanded}
            onToggleExpandAll={handleToggleExpandAll}
            selectedResource={selectedResource}
            onClearResourceFilter={() => setSelectedResource(null)}
          />

          <main className="aws-phases-container">
            {PHASES.map(phase => (
              <div key={phase.id} id={phase.id} className="aws-phase-wrapper">
                <PhaseCard
                  phase={phase}
                  isOpen={!!openPhases[phase.id]}
                  onToggleOpen={() => handleTogglePhaseOpen(phase.id)}
                  completedTaskIds={completedTaskIds}
                  onToggleTask={handleToggleTask}
                  onMarkAllInPhase={handleMarkAllInPhase}
                  config={config}
                  globalMode={globalMode}
                  selectedResource={selectedResource}
                  searchQuery={searchQuery}
                />
              </div>
            ))}
          </main>
        </div>
      </div>

      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  )
}
