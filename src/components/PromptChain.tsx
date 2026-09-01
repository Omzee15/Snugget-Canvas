import { useState } from 'react';
import { useStore } from '../store';
import type { WindowNode } from '../types';

interface Props {
  deskId: string;
  node: WindowNode;
}

// Renders just below a Claude Code terminal window (a sibling of
// .app-window's content, not inside it) — queued follow-up prompts, nearest
// (next to run) closest to the window, plus a "+" to add more. The queue
// auto-advances from Terminal.tsx's OSC 9377 handler whenever the running
// Claude Code session reports it finished a task, or immediately if Claude
// is idle when a prompt is added (see maybeKickChain in Terminal.tsx).
export function PromptChain({ deskId, node }: Props) {
  const chain = node.promptChain ?? [];
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const submit = () => {
    const text = draft.trim();
    if (text) useStore.getState().addChainPrompt(deskId, node.id, text);
    setDraft('');
    setComposing(false);
  };

  // Collapsed once more than one prompt is queued — a single "Prompt Chain
  // (n)" summary sits closest to the window; expanding it reveals the full
  // stack, still nearest-first.
  const collapsible = chain.length > 1;
  const showList = chain.length > 0 && (!collapsible || expanded);

  return (
    <div className="prompt-chain" onPointerDown={(e) => e.stopPropagation()}>
      {collapsible && (
        <button className="prompt-chain-summary" onClick={() => setExpanded((v) => !v)}>
          <span>Prompt Chain</span>
          <span className="prompt-chain-count">{chain.length}</span>
          <span className={`prompt-chain-caret${expanded ? ' open' : ''}`}>▾</span>
        </button>
      )}
      {showList && (
        <div className="prompt-chain-list">
          {chain.map((p, i) => (
            <div className="prompt-chain-item" key={i}>
              <span className="prompt-chain-index">{i + 1}</span>
              <span className="prompt-chain-text">{p}</span>
              <button
                className="prompt-chain-remove"
                title="Remove"
                onClick={() => useStore.getState().removeChainPrompt(deskId, node.id, i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {composing ? (
        <div className="prompt-chain-composer">
          <input
            autoFocus
            value={draft}
            placeholder="Next prompt…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setDraft('');
                setComposing(false);
              }
            }}
            onBlur={submit}
          />
        </div>
      ) : (
        <button className="prompt-chain-add" title="Queue a follow-up prompt" onClick={() => setComposing(true)}>
          +
        </button>
      )}
    </div>
  );
}
