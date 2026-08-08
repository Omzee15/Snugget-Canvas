import { useEffect, useState } from 'react';
import type { CdpSession } from '../../cdp';

// Mirrors just the bits of CDP's DOM.Node we render.
interface CdpNode {
  nodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue: string;
  attributes?: string[];
  children?: CdpNode[];
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function attrsToString(attributes: string[] | undefined): string {
  if (!attributes || attributes.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < attributes.length; i += 2) {
    parts.push(`${attributes[i]}="${attributes[i + 1]}"`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

function NodeRow({ node, depth }: { node: CdpNode; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (node.nodeType === TEXT_NODE) {
    const text = node.nodeValue.trim();
    if (!text) return null;
    return (
      <div className="insp-dom-row" style={{ paddingLeft: depth * 14 }}>
        <span className="insp-dom-text">{text}</span>
      </div>
    );
  }

  if (node.nodeType !== ELEMENT_NODE) return null;

  const tag = node.nodeName.toLowerCase();
  const children = (node.children ?? []).filter(
    (c) => c.nodeType === ELEMENT_NODE || (c.nodeType === TEXT_NODE && c.nodeValue.trim())
  );
  const hasChildren = children.length > 0;

  return (
    <div>
      <div className="insp-dom-row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button className="insp-dom-toggle" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="insp-dom-toggle-spacer" />
        )}
        <span className="insp-dom-tag">
          {'<'}
          {tag}
          <span className="insp-dom-attrs">{attrsToString(node.attributes)}</span>
          {'>'}
        </span>
      </div>
      {hasChildren && !collapsed && children.map((c) => <NodeRow key={c.nodeId} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function ElementsPanel({ session }: { session: CdpSession }) {
  const [root, setRoot] = useState<CdpNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    session
      .send('DOM.enable')
      .then(() => session.send<{ root: CdpNode }>('DOM.getDocument', { depth: -1, pierce: false }))
      .then((res) => {
        if (!disposed) setRoot(res.root);
      })
      .catch((err) => {
        if (!disposed) setError(err?.message ?? String(err));
      });
    return () => {
      disposed = true;
    };
  }, [session]);

  if (error) return <div className="insp-empty">Couldn't load the DOM tree — {error}</div>;
  if (!root) return <div className="insp-empty">Loading DOM tree…</div>;

  // The document node's single element child is <html> — start there.
  const htmlNode = (root.children ?? []).find((c) => c.nodeType === ELEMENT_NODE);
  return <div className="insp-elements">{htmlNode ? <NodeRow node={htmlNode} depth={0} /> : null}</div>;
}
