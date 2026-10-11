import React from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Circle } from 'lucide-react'
import TaskCard from './TaskCard'

export default function PhaseCard({
  phase,
  isOpen,
  onToggleOpen,
  completedTaskIds,
  onToggleTask,
  onMarkAllInPhase,
  config,
  globalMode,
  selectedResource,
  searchQuery
}) {
  // Filter tasks based on selected resource or search query
  const filteredTasks = phase.tasks.filter(task => {
    if (selectedResource && (!task.resources || !task.resources.includes(selectedResource))) {
      return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const titleMatch = task.title.toLowerCase().includes(q)
      const summaryMatch = task.summary.toLowerCase().includes(q)
      const cliMatch = typeof task.cliScript === 'function' 
        ? task.cliScript(config).toLowerCase().includes(q)
        : (task.cliScript || '').toLowerCase().includes(q)
      const consoleMatch = typeof task.consoleSteps === 'function'
        ? task.consoleSteps(config).join(' ').toLowerCase().includes(q)
        : (task.consoleSteps || []).join(' ').toLowerCase().includes(q)
      return titleMatch || summaryMatch || cliMatch || consoleMatch
    }
    return true
  })

  if (filteredTasks.length === 0) return null

  const totalTasks = phase.tasks.length
  const completedCount = phase.tasks.filter(t => completedTaskIds.includes(t.id)).length
  const isAllComplete = completedCount === totalTasks && totalTasks > 0

  return (
    <div className={`phase-card ${isAllComplete ? 'all-completed' : ''}`}>
      <div className="phase-header" onClick={onToggleOpen}>
        <div className="phase-title-group">
          <div className="phase-number-badge">
            {phase.number}
          </div>
          <div>
            <div className="phase-name">{phase.title}</div>
            <div className="phase-desc">{phase.description}</div>
          </div>
        </div>

        <div className="phase-meta">
          <div className="phase-counter">
            {completedCount} / {totalTasks} Done
          </div>
          <button
            className={isAllComplete ? 'btn-toggle' : 'btn-primary'}
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={(e) => {
              e.stopPropagation()
              onMarkAllInPhase(phase.id, !isAllComplete)
            }}
          >
            {isAllComplete ? 'Uncheck All' : 'Complete All'}
          </button>
          {isOpen ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
        </div>
      </div>

      {isOpen && (
        <div className="phase-content">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isCompleted={completedTaskIds.includes(task.id)}
              onToggle={onToggleTask}
              config={config}
              globalMode={globalMode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
