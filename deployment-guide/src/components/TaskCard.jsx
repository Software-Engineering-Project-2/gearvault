import React, { useState } from 'react'
import { Check, Copy, Terminal, Compass, AlertCircle, CheckCircle } from 'lucide-react'
import { AWS_RESOURCES } from '../data/phasesData'

export default function TaskCard({ task, isCompleted, onToggle, config, globalMode }) {
  const [localMode, setLocalMode] = useState(null)
  const [copied, setCopied] = useState(false)

  const activeMode = localMode || globalMode

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate dynamic CLI script and Console steps based on current config
  const renderedCli = typeof task.cliScript === 'function' ? task.cliScript(config) : task.cliScript
  const renderedConsole = typeof task.consoleSteps === 'function' ? task.consoleSteps(config) : task.consoleSteps

  return (
    <div className={`task-card ${isCompleted ? 'completed' : ''}`}>
      <div className="task-top">
        <div
          className={`custom-checkbox ${isCompleted ? 'checked' : ''}`}
          onClick={() => onToggle(task.id)}
          title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {isCompleted && <Check size={14} strokeWidth={3} />}
        </div>

        <div className="task-info">
          <div className="task-header-row">
            <span className="task-title">{task.title}</span>
            <div className="resource-tags">
              {task.resources && task.resources.map(resId => {
                const res = AWS_RESOURCES.find(r => r.id === resId)
                return (
                  <span key={resId} className="resource-tag">
                    {res ? `${res.icon} ${res.name}` : resId}
                  </span>
                )
              })}
            </div>
          </div>

          <p className="task-summary">{task.summary}</p>

          {/* Mode Tabs (CLI vs Console) */}
          <div className="mode-tabs">
            <button
              className={`mode-tab ${activeMode === 'cli' ? 'active' : ''}`}
              onClick={() => setLocalMode('cli')}
            >
              <Terminal size={12} style={{ display: 'inline', marginRight: '4px' }} />
              AWS CLI / Script
            </button>
            <button
              className={`mode-tab ${activeMode === 'console' ? 'active' : ''}`}
              onClick={() => setLocalMode('console')}
            >
              <Compass size={12} style={{ display: 'inline', marginRight: '4px' }} />
              AWS Console Steps
            </button>
            <button
              className={`mode-tab ${activeMode === 'both' ? 'active' : ''}`}
              onClick={() => setLocalMode('both')}
            >
              Dual Mode
            </button>
          </div>

          {/* CLI View */}
          {(activeMode === 'cli' || activeMode === 'both') && renderedCli && (
            <div className="code-box">
              <div className="code-header">
                <span>BASH / POWERSHELL / CLI</span>
                <button
                  className={`btn-copy ${copied ? 'copied' : ''}`}
                  onClick={() => handleCopy(renderedCli)}
                >
                  <Copy size={12} />
                  <span>{copied ? 'Copied!' : 'Copy Script'}</span>
                </button>
              </div>
              <pre className="code-content">{renderedCli}</pre>
            </div>
          )}

          {/* Console View */}
          {(activeMode === 'console' || activeMode === 'both') && renderedConsole && (
            <div className="console-box">
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AWS Management Console Step-by-Step
              </div>
              <ul className="console-step-list">
                {renderedConsole.map((step, idx) => (
                  <li key={idx} className="console-step-item">
                    <span className="step-num">{idx + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Callout if available */}
          {task.callout && (
            <div className={`callout callout-${task.callout.type || 'info'}`}>
              <AlertCircle size={16} style={{ minWidth: '16px', marginTop: '2px' }} />
              <div>{task.callout.text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
