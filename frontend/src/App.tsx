import { CodeEditor } from './components/editor/CodeEditor';
import { EditorToolbar } from './components/editor/EditorToolbar';
import { SimulatorCanvas } from './components/simulator/SimulatorCanvas';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Arduino Emulator</h1>
        <p>Local Arduino IDE & Simulator</p>
      </header>
      <div className="app-container">
        <div className="editor-panel">
          <EditorToolbar />
          <div className="editor-wrapper">
            <CodeEditor />
          </div>
        </div>
        <div className="simulator-panel">
          <SimulatorCanvas />
        </div>
      </div>
    </div>
  );
}

export default App;
