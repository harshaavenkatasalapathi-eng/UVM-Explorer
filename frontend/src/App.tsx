import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor, Position } from 'monaco-editor';
import { getVersions, lookupSymbol, type LookupResult, type UvmVersion } from './api';

const STARTER_CODE = `\`include "uvm_macros.svh"
import uvm_pkg::*;

class driver extends uvm_driver;
  \`uvm_component_utils(driver)

  function new(string name = "driver", uvm_component parent = null);
    super.new(name, parent);
  endfunction

  task run_phase(uvm_phase phase);
    \`uvm_info("DRIVER", "run_phase started", UVM_LOW)
  endtask
endclass
`;

type PeekState = { result: LookupResult; x: number; y: number } | null;

export default function App() {
  const [code, setCode] = useState(STARTER_CODE);
  const [version, setVersion] = useState<UvmVersion>('1800.2-2020');
  const [versions, setVersions] = useState<Array<{version: UvmVersion; indexed: boolean; source_available: boolean}>>([]);
  const [selected, setSelected] = useState<LookupResult | null>(null);
  const [peek, setPeek] = useState<PeekState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{name:string;type:string;file:string;start_line:number}>>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    getVersions().then(setVersions).catch((e) => setError(e.message));
  }, []);

  const openSymbol = useCallback(async (symbol: string, position?: Position, peekMode = false) => {
    setLoading(true); setError('');
    try {
      const result = await lookupSymbol(symbol, version);
      setSelected(result);
      if (peekMode && position && editorRef.current) {
        const coords = editorRef.current.getScrolledVisiblePosition(position);
        const dom = editorRef.current.getDomNode()?.getBoundingClientRect();
        setPeek({ result, x: Math.min((coords?.left ?? 30) + 40, (dom?.width ?? 900) - 460), y: Math.min((coords?.top ?? 50) + 35, (dom?.height ?? 600) - 280) });
      } else {
        setPeek(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setPeek(null);
    } finally { setLoading(false); }
  }, [version]);

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monaco.languages.register({ id: 'systemverilog' });
    monaco.languages.setMonarchTokensProvider('systemverilog', {
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/`[a-zA-Z_$][\w$]*/, 'macro'],
          [/\b(class|endclass|extends|virtual|function|endfunction|task|endtask|begin|end|if|else|case|endcase|typedef|package|endpackage|import|return|new|rand|bit|logic|int|string|time|module|endmodule)\b/, 'keyword'],
          [/\b(uvm_[a-zA-Z0-9_$]+)\b/, 'type.identifier'],
          [/\b(UVM_[A-Z0-9_]+)\b/, 'constant'],
          [/[a-zA-Z_$][\w$]*/, 'identifier'],
          [/\d+/, 'number'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"([^"\\]|\\.)*"/, 'string'],
        ],
        comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
      },
    });
    monaco.editor.defineTheme('uvm-dark', {
      base: 'vs-dark', inherit: true, rules: [
        { token: 'macro', foreground: 'D19A66' },
        { token: 'type.identifier', foreground: '4EC9B0' },
        { token: 'constant', foreground: 'C586C0' },
      ], colors: { 'editor.background': '#10151f', 'editorLineNumber.foreground': '#596579', 'editorCursor.foreground': '#e6edf3' },
    });
    editorInstance.updateOptions({ theme: 'uvm-dark' });

    // Regular click on a UVM class or macro opens Peek + the right-side source panel.
    editorInstance.onMouseDown(async (event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT || !event.target.position) return;
      const position = event.target.position;
      const word = editorInstance.getModel()?.getWordAtPosition(position);
      if (!word) return;
      const symbol = word.word.replace(/^`/, '');
      if (/^(uvm_|UVM_)/.test(symbol)) await openSymbol(symbol, position, true);
    });
  };

  const doSearch = async () => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const response = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(query)}&version=${encodeURIComponent(version)}`);
      if (!response.ok) throw new Error('Search failed');
      setSearchResults(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed'); }
  };

  const sourceLines = useMemo(() => selected?.source.split('\n') ?? [], [selected]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">U</div><div className="brand"><strong>UVM Explorer</strong><span>SystemVerilog source navigator</span></div>
      <div className="topbar-spacer" />
      <label className="version-label">UVM VERSION</label>
      <select value={version} onChange={(e) => { setVersion(e.target.value as UvmVersion); setSelected(null); setPeek(null); }}>
        <option value="1.2">UVM 1.2</option><option value="1800.2-2020">UVM 1800.2-2020</option>
      </select>
      <span className="status-dot" title="Local source index" />
    </header>

    <main className="workspace">
      <aside className="sidebar">
        <div className="side-heading">EXPLORER</div>
        <div className="tree-root">▾ &nbsp;UVM SOURCE</div>
        <div className="tree-item">📁 &nbsp;src</div><div className="tree-item indent">📁 &nbsp;base</div><div className="tree-item indent">📁 &nbsp;comps</div><div className="tree-item indent">📁 &nbsp;macros</div><div className="tree-item indent">📁 &nbsp;seq</div><div className="tree-item indent">📁 &nbsp;tlm1</div>
        <div className="side-divider" />
        <div className="side-heading">SYMBOL SEARCH</div>
        <div className="search-box"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Search UVM symbols..."/><button onClick={doSearch}>⌕</button></div>
        <div className="search-results">{searchResults.map((item, i) => <button className="search-result" key={`${item.name}-${i}`} onClick={() => openSymbol(item.name)}><span className="kind">{item.type === 'macro' ? 'M' : item.type === 'class' ? 'C' : 'ƒ'}</span><span>{item.name}</span></button>)}</div>
        <div className="sidebar-footer"><span className="status-dot"/> Local repository index<br/><small>{versions.filter(v => v.indexed).length} / 2 versions indexed</small></div>
      </aside>

      <section className="editor-area">
        <div className="tabbar"><div className="tab active"><span className="sv-icon">SV</span> editor.sv <span className="dirty">●</span></div><div className="tab-hint">Click a UVM symbol to peek at its definition</div></div>
        <div className="editor-wrap">
          <Editor height="100%" language="systemverilog" value={code} onChange={(v) => setCode(v ?? '')} onMount={handleMount} options={{ theme: 'uvm-dark', fontSize: 14, fontFamily: 'JetBrains Mono, Consolas, monospace', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'off', tabSize: 2, renderLineHighlight: 'all', padding: { top: 16 } }} />
          {peek && <div className="peek-window" style={{ left: Math.max(8, peek.x), top: Math.max(8, peek.y) }}>
            <div className="peek-header"><span><b>{peek.result.symbol}</b> <small>{peek.result.type}</small></span><button onClick={() => setPeek(null)}>×</button></div>
            <div className="peek-meta">{peek.result.file}:{peek.result.start_line}</div>
            <pre>{peek.result.definition}</pre>
            <div className="peek-actions"><button onClick={() => { setSelected(peek.result); setPeek(null); }}>Open in side panel →</button><button onClick={() => setPeek(null)}>Close</button></div>
          </div>}
        </div>
        <div className="statusbar"><span>SystemVerilog</span><span>UTF-8</span><span>Ln 1, Col 1</span><span className="status-spacer"/><span>{loading ? 'Looking up source…' : 'Ready'}</span></div>
      </section>

      <aside className="source-panel">
        <div className="panel-header"><div><strong>DEFINITION</strong><span>{selected ? selected.symbol : 'No symbol selected'}</span></div><button title="Clear" onClick={() => setSelected(null)}>×</button></div>
        {error && <div className="error-banner">{error}</div>}
        {selected ? <>
          <div className="source-meta"><span className="source-type">{selected.type}</span><span>{selected.version}</span></div>
          <div className="source-path">{selected.file}</div>
          <div className="source-code"><table><tbody>{sourceLines.map((line, i) => <tr key={i} className={i + 1 === selected.start_line ? 'focus-line' : ''}><td>{i + 1}</td><td><code>{line || ' '}</code></td></tr>)}</tbody></table></div>
          <div className="source-footer">Definition starts at line {selected.start_line} · {sourceLines.length} lines</div>
        </> : <div className="empty-state"><div className="empty-icon">⌘</div><strong>Explore UVM source</strong><p>Click a symbol such as <code>uvm_driver</code> or <code>uvm_component_utils</code> in the editor to view its source here.</p><p className="muted">You can also search for a symbol from the Explorer panel.</p></div>}
      </aside>
    </main>
    <footer className="app-footer">UVM Explorer MVP <span>·</span> Source is retrieved from your locally cloned UVM repositories <span className="footer-spacer"/>{error ? 'Backend/index issue' : 'No AI assistant · Source-based navigation'}</footer>
  </div>;
}
