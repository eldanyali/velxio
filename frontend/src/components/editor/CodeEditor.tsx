import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../store/useEditorStore';

export const CodeEditor = () => {
  const { code, setCode, theme, fontSize } = useEditorStore();

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Editor
        height="100%"
        defaultLanguage="cpp"
        theme={theme}
        value={code}
        onChange={(value) => setCode(value || '')}
        options={{
          minimap: { enabled: true },
          fontSize,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
      />
    </div>
  );
};
