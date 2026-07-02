/*
 * BottomPanel.jsx — Output panel.
 * Height: 200px default (--layout-bottom-panel-height)
 * Tabs: Output | Problems
 */
import { useState } from 'react'

function ChevronIcon({ up }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <polyline points={up ? '6 9 12 15 18 9' : '6 15 12 9 18 15'} />
    </svg>
  )
}

function BottomPanel() {
  const [activeTab, setActiveTab] = useState('output')
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="panel-bottom" style={{ height: isCollapsed ? 32 : 'var(--layout-bottom-panel-height)' }}>
      <div
        className="flex items-center"
        style={{ height: 32, flexShrink: 0, padding: '0 6px 0 0', borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex" style={{ alignItems: 'stretch', height: '100%' }}>
          <div
            className={`tab-underline${activeTab === 'output' ? ' active' : ''}`}
            style={{ padding: '0 14px', fontSize: 12 }}
            onClick={() => setActiveTab('output')}
          >
            Output
          </div>
          <div
            className={`tab-underline${activeTab === 'problems' ? ' active' : ''}`}
            style={{ padding: '0 14px', fontSize: 12 }}
            onClick={() => setActiveTab('problems')}
          >
            Problems
          </div>
        </div>
        <div className="flex items-center" style={{ marginLeft: 'auto', gap: 10, paddingRight: 8 }}>
          <span onClick={() => setIsCollapsed((v) => !v)} style={{ display: 'flex', cursor: 'pointer' }}>
            <ChevronIcon up={isCollapsed} />
          </span>
        </div>
      </div>

      {!isCollapsed && activeTab === 'output' && (
        <div className="bottom-panel-output">Run your code to see output here</div>
      )}
      {!isCollapsed && activeTab === 'problems' && (
        <div className="bottom-panel-output">No problems detected</div>
      )}
    </div>
  )
}

export default BottomPanel
