/*
 * BottomPanel.jsx — Output panel.
 * Height: 200px default (--layout-bottom-panel-height)
 * Tabs: Output | Problems | Stdin
 */
import { useEffect, useState } from 'react'

function ChevronIcon({ up }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <polyline points={up ? '6 9 12 15 18 9' : '6 15 12 9 18 15'} />
    </svg>
  )
}

function OutputTab({ output, isRunning }) {
  if (!output && !isRunning) {
    return <div className="bottom-panel-output">Click Run to execute your code</div>
  }

  if (output?.running) {
    return (
      <div className="flex items-center bottom-panel-output" style={{ gap: 8, color: 'var(--color-text-muted)' }}>
        <span className="spinner-sm" />
        Running...
      </div>
    )
  }

  if (output?.success === false) {
    return <div className="output-error">{output.error}</div>
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {output.stdout && (
        <div className="output-section">
          <div className="output-section-label">Stdout</div>
          <pre className="output-text output-stdout">{output.stdout}</pre>
        </div>
      )}
      {output.stderr && (
        <div className="output-section">
          <div className="output-section-label output-label-err">Stderr</div>
          <pre className="output-text output-stderr">{output.stderr}</pre>
        </div>
      )}
      {!output.stdout && !output.stderr && <div className="bottom-panel-output">(no output)</div>}
      <div className="output-meta">
        Exit code: {output.exitCode}
        {output.durationMs != null && ` · ${output.durationMs}ms`}
      </div>
    </div>
  )
}

function BottomPanel({ output, stdin, setStdin, isRunning }) {
  const [activeTab, setActiveTab] = useState('output')
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Running code with the panel collapsed would silently swallow the
  // result — expand it automatically so a run is never invisible.
  useEffect(() => {
    if (isRunning) setIsCollapsed(false)
  }, [isRunning])

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
          <div
            className={`tab-underline${activeTab === 'stdin' ? ' active' : ''}`}
            style={{ padding: '0 14px', fontSize: 12 }}
            onClick={() => setActiveTab('stdin')}
          >
            Stdin
          </div>
        </div>
        <div className="flex items-center" style={{ marginLeft: 'auto', gap: 10, paddingRight: 8 }}>
          <span onClick={() => setIsCollapsed((v) => !v)} style={{ display: 'flex', cursor: 'pointer' }}>
            <ChevronIcon up={isCollapsed} />
          </span>
        </div>
      </div>

      {!isCollapsed && activeTab === 'output' && <OutputTab output={output} isRunning={isRunning} />}
      {!isCollapsed && activeTab === 'problems' && <div className="bottom-panel-output">No problems detected</div>}
      {!isCollapsed && activeTab === 'stdin' && (
        <div className="flex flex-col" style={{ height: '100%' }}>
          <textarea
            className="stdin-input"
            placeholder="Input for your program (stdin)..."
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            This text will be passed as stdin when you click Run.
          </div>
        </div>
      )}
    </div>
  )
}

export default BottomPanel
