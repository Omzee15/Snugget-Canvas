import { snugget } from './bridge';

// Thin per-inspector-tile session wrapper over the raw debugger:* IPC —
// tracks which nodeId this instance owns, fans out CDP notifications to
// per-method listeners, and exposes a typed-ish sendCommand.
export class CdpSession {
  private nodeId: string;
  private listeners = new Map<string, Set<(params: any) => void>>();
  private disposeEvent: (() => void) | null = null;
  private attached = false;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  async attach(targetId: number): Promise<boolean> {
    this.disposeEvent = snugget.onDebuggerEvent(({ nodeId, method, params }) => {
      if (nodeId !== this.nodeId) return;
      if (method === '__detached') {
        this.attached = false;
        this.emit('__detached', params);
        return;
      }
      this.emit(method, params);
    });
    const ok = await snugget.debuggerAttach(this.nodeId, targetId);
    this.attached = ok;
    return ok;
  }

  isAttached() {
    return this.attached;
  }

  send<T = any>(method: string, params?: unknown): Promise<T> {
    return snugget.debuggerSendCommand(this.nodeId, method, params);
  }

  on(method: string, cb: (params: any) => void): () => void {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method)!.add(cb);
    return () => this.listeners.get(method)?.delete(cb);
  }

  private emit(method: string, params: any) {
    this.listeners.get(method)?.forEach((cb) => cb(params));
  }

  dispose() {
    this.disposeEvent?.();
    this.disposeEvent = null;
    this.listeners.clear();
    if (this.attached) {
      this.attached = false;
      snugget.debuggerDetach(this.nodeId).catch(() => {});
    }
  }
}
