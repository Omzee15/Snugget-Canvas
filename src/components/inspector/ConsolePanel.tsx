import { useEffect, useRef, useState } from 'react';
import type { CdpSession } from '../../cdp';

interface LogLine {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  source: 'console' | 'exception';
}

let nextId = 1;

// Renders a Runtime.RemoteObject the same way the real console does for
// primitives/simple values — good enough for a first pass; objects show
// their className/description rather than a full expandable tree.
function formatArg(arg: any): string {
  if (arg == null) return String(arg);
  if (arg.type === 'string') return arg.value;
  if (arg.type === 'number' || arg.type === 'boolean') return String(arg.value);
  if (arg.type === 'undefined') return 'undefined';
  if (arg.subtype === 'null') return 'null';
  if (arg.subtype === 'array') return arg.description ?? '[Array]';
  if (arg.type === 'object') return arg.description ?? '[Object]';
  if (arg.type === 'function') return arg.description ?? '[Function]';
  return arg.description ?? String(arg.value ?? '');
}

export function ConsolePanel({ session }: { session: CdpSession }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    session.send('Runtime.enable').catch(() => {});
    session.send('Log.enable').catch(() => {});

    const offConsole = session.on('Runtime.consoleAPICalled', (p) => {
      const level = ['warning'].includes(p.type)
        ? 'warn'
        : ['log', 'info', 'error', 'debug'].includes(p.type)
          ? p.type
          : 'log';
      const text = (p.args ?? []).map(formatArg).join(' ');
      setLines((prev) => [...prev.slice(-499), { id: nextId++, level, text, source: 'console' }]);
    });

    const offException = session.on('Runtime.exceptionThrown', (p) => {
      const text = p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'Uncaught exception';
      setLines((prev) => [...prev.slice(-499), { id: nextId++, level: 'error', text, source: 'exception' }]);
    });

    const offLog = session.on('Log.entryAdded', (p) => {
      const entry = p.entry ?? {};
      const level = ['warning'].includes(entry.level) ? 'warn' : entry.level ?? 'log';
      setLines((prev) => [
        ...prev.slice(-499),
        { id: nextId++, level, text: entry.text ?? '', source: 'console' }
      ]);
    });

    return () => {
      offConsole();
      offException();
      offLog();
    };
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <div className="insp-console">
      {lines.length === 0 && <div className="insp-empty">No console output yet.</div>}
      {lines.map((l) => (
        <div key={l.id} className={`insp-console-line insp-level-${l.level}`}>
          {l.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
