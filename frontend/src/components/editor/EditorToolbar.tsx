import { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { compileCode } from '../../services/compilation';
import './EditorToolbar.css';

export const EditorToolbar = () => {
  const { code } = useEditorStore();
  const { setCompiledHex, startSimulation, stopSimulation, resetSimulation, running, compiledHex } = useSimulatorStore();
  const [compiling, setCompiling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCompile = async () => {
    setCompiling(true);
    setMessage(null);

    try {
      console.log('Starting compilation...');
      const result = await compileCode(code);
      console.log('Compilation result:', result);

      if (result.success && result.hex_content) {
        setCompiledHex(result.hex_content);
        setMessage({ type: 'success', text: 'Compilation successful! Ready to run.' });
      } else {
        const errorMsg = result.error || result.stderr || 'Compilation failed';
        console.error('Compilation error:', errorMsg);
        console.error('Full result:', JSON.stringify(result, null, 2));
        setMessage({
          type: 'error',
          text: errorMsg,
        });
      }
    } catch (err) {
      console.error('Compilation exception:', err);
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Compilation failed',
      });
    } finally {
      setCompiling(false);
    }
  };

  const handleRun = () => {
    if (compiledHex) {
      startSimulation();
      setMessage({ type: 'success', text: 'Simulation started' });
    } else {
      setMessage({ type: 'error', text: 'Please compile the code first' });
    }
  };

  const handleStop = () => {
    stopSimulation();
    setMessage({ type: 'success', text: 'Simulation stopped' });
  };

  const handleReset = () => {
    resetSimulation();
    setMessage({ type: 'success', text: 'Simulation reset' });
  };

  return (
    <div className="editor-toolbar">
      <div className="toolbar-buttons">
        <button onClick={handleCompile} disabled={compiling} className="btn btn-primary">
          {compiling ? 'Compiling...' : 'Compile'}
        </button>
        <button
          onClick={handleRun}
          disabled={running || !compiledHex}
          className="btn btn-success"
        >
          Run
        </button>
        <button onClick={handleStop} disabled={!running} className="btn btn-danger">
          Stop
        </button>
        <button onClick={handleReset} disabled={!compiledHex} className="btn btn-secondary">
          Reset
        </button>
      </div>
      {message && (
        <div className={`toolbar-message ${message.type}`}>{message.text}</div>
      )}
    </div>
  );
};
