import { useState } from "react";
import {
  activeLayout,
  addLayout,
  addPanel,
  deleteLayout,
  movePanel,
  PANEL_META,
  removePanel,
  renameLayout,
  resizePanel,
  setActiveLayout,
  useTerminalStore,
  type Panel,
  type PanelType,
} from "../../lib/terminalLayout";
import { WatchlistList, WidgetHost } from "./TerminalWidgets";

const ADDABLE: PanelType[] = [
  "chart",
  "watchlist",
  "treemap",
  "movers",
  "quotes",
  "macro",
  "correlation",
  "portfolio",
  "compare",
  "wire",
  "signals",
  "econ",
  "breaking",
  "geointel",
  "instflow",
  "cot",
  "smartmoney",
];

/**
 * The tiling panel workspace. Panels come from the active saved layout
 * (localStorage-backed); an Edit mode exposes per-panel reorder / resize /
 * remove controls. A persistent watchlist rail sits to the right.
 */
export function TerminalWorkspace() {
  const store = useTerminalStore();
  const layout = activeLayout(store);
  const [edit, setEdit] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="fbt-ws">
      <div className="fbt-ws-toolbar">
        <div className="fbt-ws-layouts">
          {store.layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              className="fbt-w-chip"
              data-active={l.id === store.activeId}
              onClick={() => setActiveLayout(l.id)}
              onDoubleClick={() => {
                const n = window.prompt("Rename layout", l.name);
                if (n !== null) renameLayout(l.id, n);
              }}
              title="Click to switch · double-click to rename"
            >
              {l.name}
            </button>
          ))}
          <button
            type="button"
            className="fbt-ws-icon"
            onClick={() => {
              const n = window.prompt("New layout name", "Layout");
              if (n !== null) addLayout(n);
            }}
          >
            ＋ Layout
          </button>
        </div>

        <div className="fbt-ws-actions">
          <div className="fbt-ws-add">
            <button
              type="button"
              className="fbt-ws-icon"
              aria-expanded={addOpen}
              onClick={() => setAddOpen((v) => !v)}
            >
              ＋ Panel
            </button>
            {addOpen && (
              <div className="fbt-ws-menu" role="menu">
                {ADDABLE.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      addPanel(t);
                      setAddOpen(false);
                    }}
                  >
                    {PANEL_META[t].label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="fbt-ws-icon"
            data-active={edit}
            onClick={() => setEdit((v) => !v)}
          >
            {edit ? "Done" : "Edit"}
          </button>
          {store.layouts.length > 1 && (
            <button
              type="button"
              className="fbt-ws-icon"
              title="Delete this layout"
              onClick={() => {
                if (window.confirm(`Delete layout "${layout.name}"?`)) deleteLayout(layout.id);
              }}
            >
              🗑
            </button>
          )}
        </div>
      </div>

      <div className="fbt-ws-body">
        <div className="fbt-ws-grid">
          {layout.panels.length === 0 ? (
            <div className="fbt-empty">Empty layout — use ＋ Panel to add widgets.</div>
          ) : (
            layout.panels.map((p, i) => (
              <PanelShell
                key={p.id}
                panel={p}
                edit={edit}
                first={i === 0}
                last={i === layout.panels.length - 1}
              />
            ))
          )}
        </div>

        <aside className="fbt-rail">
          <div className="fbt-rail-head">Watchlist</div>
          <div className="fbt-rail-body">
            <WatchlistList removable />
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelShell(props: { panel: Panel; edit: boolean; first: boolean; last: boolean }) {
  const { panel, edit, first, last } = props;
  return (
    <section className="fbt-panel fbt-ws-panel" data-span={panel.span}>
      <div className="fbt-panel-head">
        {PANEL_META[panel.type].label}
        {edit ? (
          <span className="fbt-panel-ctrls">
            <button type="button" title="Move left" disabled={first} onClick={() => movePanel(panel.id, -1)}>
              ◀
            </button>
            <button type="button" title="Move right" disabled={last} onClick={() => movePanel(panel.id, 1)}>
              ▶
            </button>
            <button type="button" title="Resize" onClick={() => resizePanel(panel.id)}>
              ⤢ {panel.span}×
            </button>
            <button type="button" title="Remove" onClick={() => removePanel(panel.id)}>
              ✕
            </button>
          </span>
        ) : (
          <span className="cnt">{PANEL_META[panel.type].label === "Chart" ? "linked" : ""}</span>
        )}
      </div>
      <div className="fbt-panel-body">
        <WidgetHost type={panel.type} />
      </div>
    </section>
  );
}
