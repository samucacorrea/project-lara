import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const highlightCss = (css: string) => {
  const escaped = escapeHtml(css);
  const withTokens = escaped
    .replace(/(\.[A-Za-z0-9_-]+)/g, '<span style="color:#7dc5ff">$1</span>')
    .replace(/([A-Za-z-]+)(?=\s*:)/g, '<span style="color:#facc15">$1</span>')
    .replace(/(:\s*)([^;]+)(;|$)/g, '$1<span style="color:#a5b4fc">$2</span>$3')
    .replace(/(#[0-9a-fA-F]{3,8})/g, '<span style="color:#6ee7b7">$1</span>');

  const lineStyle = 'display:flex;gap:0.75rem;min-height:1.15rem;width:100%;';
  const numberStyle =
    'width:32px;text-align:right;color:#475569;font-size:0.7rem;user-select:none;font-family:inherit;';
  const contentStyle = 'flex:1;color:#dbeafe;word-break:break-word;';

  return withTokens
    .split('\n')
    .map((line, idx) => {
      const content = line.length ? line : '&nbsp;';
      return `<span style="${lineStyle}"><span style="${numberStyle}">${idx + 1}</span><span style="${contentStyle}">${content}</span></span>`;
    })
    .join('\n');
};

type AdvancedCssEditorProps = {
  value?: string;
  onChange: (value: string) => void;
  onValidationChange?: (error: string | null) => void;
};

export const AdvancedCssEditor: React.FC<AdvancedCssEditorProps> = ({
  value = '',
  onChange,
  onValidationChange,
}) => {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const colorPickerRef = useRef<HTMLInputElement | null>(null);
  const colorInsertPos = useRef<number | null>(null);
  const replaceHashAtPos = useRef<boolean>(false);
  const latestOnChange = useRef(onChange);

  useEffect(() => {
    latestOnChange.current = onChange;
  }, [onChange]);

  const applyDraft = useCallback((next: string, notify = true) => {
    setDraft(next);
    if (notify) {
      latestOnChange.current(next);
    }
  }, []);

  useEffect(() => {
    if (value !== draft) {
      applyDraft(value, false);
    }
  }, [value, draft, applyDraft]);

  useEffect(() => {
    const openBraces = (draft.match(/{/g) || []).length;
    const closeBraces = (draft.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      const message =
        openBraces > closeBraces
          ? 'Existem chaves de abertura sem fechamento.'
          : 'Existem chaves de fechamento extras.';
      setError(message);
      onValidationChange?.(message);
      return;
    }
    setError(null);
    onValidationChange?.(null);
  }, [draft, onValidationChange]);

  const highlighted = useMemo(() => highlightCss(draft || ''), [draft]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === '#') {
      const target = event.currentTarget;
      const caret = target.selectionStart ?? draft.length;
      colorInsertPos.current = caret;
      replaceHashAtPos.current = true;
      requestAnimationFrame(() => colorPickerRef.current?.click());
    }
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const color = event.target.value;
    if (!color || colorInsertPos.current === null) return;

    const currentValue = draft;
    const insertAt = colorInsertPos.current ?? currentValue.length;
    let before = currentValue.slice(0, insertAt);
    let after = currentValue.slice(insertAt);

    if (replaceHashAtPos.current) {
      if (after.startsWith('#')) {
        after = after.slice(1);
      } else if (before.endsWith('#')) {
        before = before.slice(0, before.length - 1);
      }
    }

    replaceHashAtPos.current = false;
    colorInsertPos.current = null;
    applyDraft(`${before}${color}${after}`);
  };

  return (
    <div className="advanced-css-editor space-y-2">
      <div className="editor-title flex items-center justify-between bg-[#0b1220] text-xs text-gray-300 px-3 py-2 rounded-t-xl border border-[#1f2937] border-b-0 shadow-inner">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </span>
          <span className="font-semibold text-[#e5e7eb]">widget.css</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Avançado</span>
      </div>
      <div
        className="editor-shell"
        style={{
          background: '#050d1a',
          borderBottomLeftRadius: '0.75rem',
          borderBottomRightRadius: '0.75rem',
          border: '1px solid #111827',
          borderTop: 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <pre
          className="code-preview"
          aria-hidden="true"
          style={{
            display: 'block',
            width: '100%',
            margin: 0,
            padding: '0.85rem 1rem',
            minHeight: 220,
            whiteSpace: 'pre-wrap',
            background: 'transparent',
            fontFamily: `'JetBrains Mono','Fira Code',monospace`,
            fontSize: '0.8rem',
            lineHeight: 1.35,
            overflow: 'hidden',
          }}
        >
          <code
            style={{ display: 'block', width: '100%' }}
            dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
          />
        </pre>
        <textarea
          ref={textareaRef}
          value={draft}
          spellCheck={false}
          onChange={(e) => applyDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="code-input"
          style={{
            position: 'absolute',
            inset: 0,
            resize: 'none',
            background: 'transparent',
            color: 'transparent',
            caretColor: '#38bdf8',
            padding: '0.85rem 1rem',
            fontFamily: `'JetBrains Mono','Fira Code',monospace`,
            fontSize: '0.8rem',
            lineHeight: 1.35,
            border: 'none',
            tabSize: 2,
          }}
          placeholder={`.this {\n  color: #111827;\n}`}
        />
        <input
          ref={colorPickerRef}
          type="color"
          className="hidden"
          onChange={handleColorChange}
        />
      </div>
      {error ? (
        <p className="text-xs text-red-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-gray-500">
          Use <code className="px-1 py-0.5 bg-gray-100 rounded">.this</code> para atingir o widget atual.
        </p>
      )}
      <style>{`
        .advanced-css-editor .code-input:focus { outline: none; }
      `}</style>
    </div>
  );
};
