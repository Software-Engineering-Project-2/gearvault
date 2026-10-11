import React from 'react'
import { Sliders, RefreshCw } from 'lucide-react'

export default function ConfigBar({ config, setConfig, onResetDefaults }) {
  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="config-panel">
      <div className="config-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={18} color="#0073BB" />
          <span>Interactive Deployment Variables Customizer</span>
        </div>
        <button 
          onClick={onResetDefaults}
          className="btn-toggle"
          title="Reset variables to default ap-south-1 values"
        >
          <RefreshCw size={13} />
          <span>Reset Defaults</span>
        </button>
      </div>

      <div style={{ fontSize: '13px', color: '#5F6B7A' }}>
        Changing these values updates all CLI commands, Task Definition JSONs, and console instructions across the entire 16-service runbook in real time.
      </div>

      <div className="config-grid">
        <div className="config-field">
          <label>Primary AWS Region</label>
          <input
            type="text"
            className="config-input"
            value={config.region}
            onChange={(e) => handleChange('region', e.target.value)}
            placeholder="ap-south-1"
          />
        </div>

        <div className="config-field">
          <label>CloudFront / Custom Domain</label>
          <input
            type="text"
            className="config-input"
            value={config.domain}
            onChange={(e) => handleChange('domain', e.target.value)}
            placeholder="d12345.cloudfront.net"
          />
        </div>

        <div className="config-field">
          <label>Origin Verification Header Secret</label>
          <input
            type="text"
            className="config-input"
            value={config.originVerifyHeader}
            onChange={(e) => handleChange('originVerifyHeader', e.target.value)}
            placeholder="GearVaultOriginSecret2026"
          />
        </div>

        <div className="config-field">
          <label>S3 Media Bucket Name</label>
          <input
            type="text"
            className="config-input"
            value={config.mediaBucket}
            onChange={(e) => handleChange('mediaBucket', e.target.value)}
            placeholder="gearvault-media-apsouth1"
          />
        </div>

        <div className="config-field">
          <label>S3 Frontend Bucket Name</label>
          <input
            type="text"
            className="config-input"
            value={config.frontendBucket}
            onChange={(e) => handleChange('frontendBucket', e.target.value)}
            placeholder="gearvault-frontend-apsouth1"
          />
        </div>

        <div className="config-field">
          <label>PostgreSQL Master User</label>
          <input
            type="text"
            className="config-input"
            value={config.dbUser}
            onChange={(e) => handleChange('dbUser', e.target.value)}
            placeholder="gearvault_admin"
          />
        </div>
      </div>
    </div>
  )
}
