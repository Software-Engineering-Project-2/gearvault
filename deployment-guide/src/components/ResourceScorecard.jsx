import React from 'react'
import { AWS_RESOURCES } from '../data/phasesData'
import { Award, CheckCircle2 } from 'lucide-react'

export default function ResourceScorecard({ completedTaskIds, phases, onSelectResource, selectedResource }) {
  // Determine if a resource has all its associated tasks checked
  const getResourceStatus = (resId) => {
    let relatedTasks = []
    phases.forEach(phase => {
      phase.tasks.forEach(task => {
        if (task.resources && task.resources.includes(resId)) {
          relatedTasks.push(task.id)
        }
      })
    })

    if (relatedTasks.length === 0) return { active: false, count: 0, completed: 0 }
    const doneCount = relatedTasks.filter(id => completedTaskIds.includes(id)).length
    return {
      active: doneCount === relatedTasks.length,
      count: relatedTasks.length,
      completed: doneCount
    }
  }

  const completedResourcesCount = AWS_RESOURCES.filter(r => getResourceStatus(r.id).active).length

  return (
    <div className="scorecard-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={20} color="#f59e0b" />
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f1f5f9' }}>
            20-Service Assignment Compliance Scorecard
          </h3>
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
          Active Resources: <span style={{ color: '#10b981', fontWeight: '700' }}>{completedResourcesCount}</span> / {AWS_RESOURCES.length}
        </div>
      </div>

      <div className="scorecard-grid">
        {AWS_RESOURCES.map(res => {
          const status = getResourceStatus(res.id)
          const isSelected = selectedResource === res.id

          return (
            <div
              key={res.id}
              className="scorecard-item"
              onClick={() => onSelectResource(isSelected ? null : res.id)}
              style={{
                cursor: 'pointer',
                borderColor: isSelected ? 'var(--accent-blue)' : undefined,
                background: isSelected ? 'rgba(59, 130, 246, 0.1)' : undefined
              }}
              title={`Click to filter tasks for ${res.name}`}
            >
              <div className="scorecard-left">
                <div className="scorecard-icon">{res.icon}</div>
                <div>
                  <div className="scorecard-name">{res.name}</div>
                  <div className="scorecard-cat">{res.cat} • {status.completed}/{status.count} tasks</div>
                </div>
              </div>
              <div className={`scorecard-status ${status.active ? 'active' : ''}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
