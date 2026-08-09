import { ColorWheel } from './ColorWheel';
import { DEFAULT_CANVAS_BASE_COLOR, useStore } from '../store';

const PRESET_COLORS = ['#174027', '#1a233d', '#17181b', '#7f3536', '#663710'];

export function AppearanceSettings() {
  const canvasBaseColor = useStore((s) => s.canvasBaseColor);
  const canvasGridEnabled = useStore((s) => s.canvasGridEnabled);

  const close = () => useStore.getState().setAppearanceOpen(false);

  return (
    <div className="palette-overlay" onPointerDown={close}>
      <div className="kb-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="kb-settings-header">
          <h2>Appearance</h2>
          <div className="kb-settings-header-actions">
            <button
              className="kb-reset-all"
              onClick={() => {
                useStore.getState().setCanvasBaseColor(DEFAULT_CANVAS_BASE_COLOR);
                useStore.getState().setCanvasGridEnabled(true);
              }}
            >
              Reset
            </button>
            <button className="kb-close" onClick={close} title="Close">
              ×
            </button>
          </div>
        </div>
        <div className="kb-settings-body">
          <div className="kb-group">
            <div className="kb-group-title">Canvas</div>

            <div className="kb-row">
              <span className="kb-label">Show grid lines</span>
              <label className="appear-toggle">
                <input
                  type="checkbox"
                  checked={canvasGridEnabled}
                  onChange={(e) => useStore.getState().setCanvasGridEnabled(e.target.checked)}
                />
                <span className="appear-toggle-track" />
              </label>
            </div>

            <div className="kb-row">
              <span className="kb-label">Base color</span>
              <span className="appear-color-value">{canvasBaseColor}</span>
            </div>

            <div className="appear-swatches">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  className={`appear-swatch${color === canvasBaseColor ? ' active' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => useStore.getState().setCanvasBaseColor(color)}
                />
              ))}
            </div>

            <div className="kb-group-title appear-wheel-title">Custom color</div>
            <div className="appear-wheel-row">
              <ColorWheel
                value={canvasBaseColor}
                onChange={(hex) => useStore.getState().setCanvasBaseColor(hex)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
