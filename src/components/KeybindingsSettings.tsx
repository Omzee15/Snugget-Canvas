import { useEffect, useState } from 'react';
import {
  comboFromEvent,
  formatCombo,
  isModifierOnly,
  KEYBINDING_DEFS,
  type KeybindingId
} from '../keybindings';
import { useStore } from '../store';

// Groups KEYBINDING_DEFS by category, preserving first-seen order — avoids
// depending on a fixed category list here when the registry gains one.
function groupedDefs() {
  const order: string[] = [];
  const byCategory = new Map<string, typeof KEYBINDING_DEFS>();
  for (const def of KEYBINDING_DEFS) {
    if (!byCategory.has(def.category)) {
      byCategory.set(def.category, []);
      order.push(def.category);
    }
    byCategory.get(def.category)!.push(def);
  }
  return order.map((category) => ({ category, defs: byCategory.get(category)! }));
}

export function KeybindingsSettings() {
  const keybindings = useStore((s) => s.keybindings);
  const [capturing, setCapturing] = useState<KeybindingId | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const close = () => {
    useStore.getState().setKeybindingsOpen(false);
  };

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isModifierOnly(e)) return;
      if (e.key === 'Escape') {
        setCapturing(null);
        setConflict(null);
        return;
      }
      const combo = comboFromEvent(e);
      const s = useStore.getState();
      const takenBy = KEYBINDING_DEFS.find(
        (d) => d.id !== capturing && s.keybindings[d.id] === combo
      );
      if (takenBy) {
        setConflict(`Already used by "${takenBy.label}"`);
        return;
      }
      s.setKeybinding(capturing, combo);
      setCapturing(null);
      setConflict(null);
    };
    // Capture phase so this wins over the app's own shortcut handler while
    // recording — otherwise e.g. pressing "v" would also switch tools.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing]);

  return (
    <div className="palette-overlay" onPointerDown={close}>
      <div className="kb-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="kb-settings-header">
          <h2>Keyboard Shortcuts</h2>
          <div className="kb-settings-header-actions">
            <button
              className="kb-reset-all"
              onClick={() => {
                useStore.getState().resetAllKeybindings();
                setCapturing(null);
                setConflict(null);
              }}
            >
              Reset all
            </button>
            <button className="kb-close" onClick={close} title="Close">
              ×
            </button>
          </div>
        </div>
        <div className="kb-settings-body">
          {groupedDefs().map(({ category, defs }) => (
            <div key={category} className="kb-group">
              <div className="kb-group-title">{category}</div>
              {defs.map((def) => (
                <div key={def.id} className="kb-row">
                  <span className="kb-label">{def.label}</span>
                  {capturing === def.id ? (
                    <div className="kb-capture">
                      <span className="kb-capture-hint">
                        {conflict ?? 'Press a key combo… (Esc cancels)'}
                      </span>
                      <button
                        className="kb-capture-cancel"
                        onClick={() => {
                          setCapturing(null);
                          setConflict(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="kb-row-actions">
                      <button
                        className="kb-combo"
                        onClick={() => {
                          setCapturing(def.id);
                          setConflict(null);
                        }}
                        title="Click to change"
                      >
                        {formatCombo(keybindings[def.id] ?? def.default)}
                      </button>
                      {keybindings[def.id] !== def.default && (
                        <button
                          className="kb-reset"
                          title="Reset to default"
                          onClick={() => useStore.getState().resetKeybinding(def.id)}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
