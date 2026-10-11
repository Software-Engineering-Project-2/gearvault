import React from 'react'
import { Search, Terminal, Compass, LayoutGrid, ChevronsUpDown, X } from 'lucide-react'

export default function ControlsBar({
  searchQuery,
  setSearchQuery,
  globalMode,
  setGlobalMode,
  allExpanded,
  onToggleExpandAll,
  selectedResource,
  onClearResourceFilter
}) {
  return (
    <div className="controls-bar">
      <div className="search-box">
        <Search size={16} color="#64748b" />
        <input
          type="text"
          className="search-input"
          placeholder="Search instructions, commands, or AWS resources..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <X
            size={16}
            color="#94a3b8"
            style={{ cursor: 'pointer' }}
            onClick={() => setSearchQuery('')}
          />
        )}
      </div>

      {selectedResource && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(59, 130, 246, 0.15)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#93c5fd' }}>
          <span>Filtering: <strong>{selectedResource}</strong></span>
          <X size={14} style={{ cursor: 'pointer' }} onClick={onClearResourceFilter} />
        </div>
      )}

      <div className="view-toggles">
        <div style={{ fontSize: '12px', color: '#64748b', marginRight: '6px' }}>View:</div>
        <button
          className={`btn-toggle ${globalMode === 'cli' ? 'active' : ''}`}
          onClick={() => setGlobalMode('cli')}
          title="Show AWS CLI Commands"
        >
          <Terminal size={13} />
          <span>CLI</span>
        </button>
        <button
          className={`btn-toggle ${globalMode === 'console' ? 'active' : ''}`}
          onClick={() => setGlobalMode('console')}
          title="Show AWS Console Walkthrough"
        >
          <Compass size={13} />
          <span>Console</span>
        </button>
        <button
          className={`btn-toggle ${globalMode === 'both' ? 'active' : ''}`}
          onClick={() => setGlobalMode('both')}
          title="Show Both CLI & Console"
        >
          <LayoutGrid size={13} />
          <span>Dual</span>
        </button>

        <button
          className="btn-toggle"
          onClick={onToggleExpandAll}
          style={{ marginLeft: '8px' }}
        >
          <ChevronsUpDown size={13} />
          <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
        </button>
      </div>
    </div>
  )
}
