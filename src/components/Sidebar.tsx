import { useEffect, useState } from 'react';
import { canvasController } from '../canvasController';
import { snugget } from '../bridge';
import { useStore } from '../store';
import type { Desk, WindowNode } from '../types';

interface Editing {
  kind: 'desk' | 'group';
  id: string;
}

function ScreenRow({ desk, win, indent }: { desk: Desk; win: WindowNode; indent: boolean }) {
  const selected = useStore(
    (s) => s.selectedWindowId === win.id && s.activeDeskId === desk.id
  );
  const group = desk.groups.find((g) => g.id === win.groupId) ?? null;

  return (
    <div
      className={`screen-row${selected ? ' active' : ''}${indent ? ' indent' : ''}`}
      onClick={() => {
        const s = useStore.getState();
        s.setActiveDesk(desk.id);
        s.select(win.id);
        s.bringToFront(desk.id, win.id);
      }}
      onDoubleClick={() => canvasController.current?.focusWindow(win.id)}
      title={`${win.title || win.url}\nDouble-click to zoom to this screen`}
    >
      {win.favicon ? (
        <img className="favicon" src={win.favicon} alt="" draggable={false} />
      ) : (
        <span className="favicon-dot" />
      )}
      <span className="screen-title">{win.title || win.url}</span>
      <span
        className={`group-pick${group ? ' has-group' : ''}`}
        title={group ? `Group: ${group.name}` : 'Assign to a group'}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span
          className="group-dot"
          style={
            group
              ? { background: group.color, borderColor: group.color }
              : undefined
          }
        />
        <select
          value={win.groupId ?? ''}
          onChange={(e) =>
            useStore.getState().assignGroup(desk.id, win.id, e.target.value || null)
          }
        >
          <option value="">No group</option>
          {desk.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </span>
      <button
        className="icon-btn row-close"
        title="Close screen"
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().removeWindow(desk.id, win.id);
        }}
      >
        ×
      </button>
    </div>
  );
}

function GoogleConnect() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    snugget.googleStatus().then((s) => setConnected(s.connected));
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const res = await snugget.googleSignIn();
    setBusy(false);
    setConnected(res.connected);
    if (!res.connected) setError(res.error ?? 'Sign-in failed');
  };

  const disconnect = async () => {
    setBusy(true);
    const res = await snugget.googleSignOut();
    setBusy(false);
    setConnected(res.connected);
  };

  return (
    <div className="google-connect">
      <button
        className="google-connect-btn"
        disabled={busy}
        onClick={connected ? disconnect : connect}
        title={connected ? 'Disconnect Google account' : 'Connect Google (Gmail/Calendar read access)'}
      >
        {busy ? 'Working…' : connected ? 'Google connected' : 'Connect Google'}
      </button>
      {error && <div className="google-connect-error">{error}</div>}
    </div>
  );
}

export function Sidebar() {
  const desks = useStore((s) => s.desks);
  const activeDeskId = useStore((s) => s.activeDeskId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (kind: Editing['kind'], id: string, current: string) => {
    setEditing({ kind, id });
    setDraft(current);
  };

  const commitEdit = (deskId?: string) => {
    if (editing && draft.trim()) {
      const s = useStore.getState();
      if (editing.kind === 'desk') s.renameDesk(editing.id, draft.trim());
      else if (deskId) s.renameGroup(deskId, editing.id, draft.trim());
    }
    setEditing(null);
  };

  const nameEditor = (deskId?: string) => (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitEdit(deskId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitEdit(deskId);
        if (e.key === 'Escape') setEditing(null);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo">Snugget Canvas</span>
      </div>

      <div className="sidebar-section">
        <span>Desktops</span>
        <button
          className="icon-btn"
          title="New desktop"
          onClick={() => useStore.getState().addDesk()}
        >
          +
        </button>
      </div>

      <div className="desk-list">
        {desks.map((desk) => {
          const expanded = !collapsed[desk.id];
          const grouped = new Set(desk.groups.map((g) => g.id));
          const ungrouped = desk.windows.filter(
            (w) => !w.groupId || !grouped.has(w.groupId)
          );
          return (
            <div key={desk.id} className="desk-block">
              <div
                className={`desk-item${desk.id === activeDeskId ? ' active' : ''}`}
                onClick={() => useStore.getState().setActiveDesk(desk.id)}
                onDoubleClick={() => startEdit('desk', desk.id, desk.name)}
              >
                <button
                  className={`icon-btn chevron${expanded ? ' open' : ''}`}
                  title={expanded ? 'Collapse' : 'Expand'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => ({ ...c, [desk.id]: expanded }));
                  }}
                >
                  ▸
                </button>
                {editing?.kind === 'desk' && editing.id === desk.id ? (
                  nameEditor()
                ) : (
                  <>
                    <span className="desk-name">{desk.name}</span>
                    <span className="desk-count">{desk.windows.length}</span>
                    {desks.length > 1 && (
                      <button
                        className="icon-btn desk-delete"
                        title="Delete desktop"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            desk.windows.length === 0 ||
                            window.confirm(
                              `Delete "${desk.name}" and its ${desk.windows.length} screen(s)?`
                            )
                          ) {
                            useStore.getState().removeDesk(desk.id);
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>

              {expanded && (
                <div className="desk-children">
                  {desk.groups.map((group) => {
                    const members = desk.windows.filter((w) => w.groupId === group.id);
                    return (
                      <div key={group.id}>
                        <div
                          className="group-row"
                          onDoubleClick={() => startEdit('group', group.id, group.name)}
                          title="Double-click to rename"
                        >
                          <span className="group-dot" style={{ background: group.color }} />
                          {editing?.kind === 'group' && editing.id === group.id ? (
                            nameEditor(desk.id)
                          ) : (
                            <>
                              <span className="group-name">{group.name}</span>
                              <span className="desk-count">{members.length}</span>
                              <button
                                className="icon-btn row-close"
                                title="Delete group (screens stay open)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useStore.getState().removeGroup(desk.id, group.id);
                                }}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                        {members.map((win) => (
                          <ScreenRow key={win.id} desk={desk} win={win} indent />
                        ))}
                      </div>
                    );
                  })}

                  {ungrouped.map((win) => (
                    <ScreenRow key={win.id} desk={desk} win={win} indent={false} />
                  ))}

                  {desk.windows.length === 0 && (
                    <div className="no-screens">No screens open</div>
                  )}

                  <button
                    className="new-group-btn"
                    onClick={() => useStore.getState().addGroup(desk.id)}
                  >
                    + New group
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <GoogleConnect />
        <div><kbd>⇧A</kbd> open menu</div>
        <div><kbd>V</kbd> move · <kbd>H</kbd> hand</div>
        <div><kbd>⌘±</kbd> zoom · <kbd>⇧1</kbd> fit</div>
      </div>
    </aside>
  );
}
