import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { toggleTheme } from "../lib/theme";

const RECENTS_KEY = "finbrio-recent-symbols";
type Recent = { symbol: string; name: string };

function readRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(r: Recent) {
  try {
    const next = [r, ...readRecents().filter((x) => x.symbol !== r.symbol)].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable — recents are best-effort */
  }
}

const NAV_ITEMS = [
  { to: "/terminal", label: "Terminal", hint: "Workspace" },
  { to: "/markets", label: "Markets", hint: "Heatmap · Indices · FX" },
  { to: "/trading", label: "Trading", hint: "Signals · Scanners" },
  { to: "/investing", label: "Investing", hint: "Exposure · ETFs" },
  { to: "/macro", label: "Macro", hint: "Stress · Rates · Debt" },
  { to: "/wire", label: "Wire", hint: "News · OSINT" },
] as const;

export function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<Recent[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Refresh recents each time the palette opens.
  useEffect(() => {
    if (props.open) setRecents(readRecents());
  }, [props.open]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: props.open && debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const close = () => {
    props.onOpenChange(false);
    setQuery("");
  };

  const goSymbol = (symbol: string, name: string) => {
    pushRecent({ symbol, name });
    close();
    void navigate({ to: "/asset/$symbol", params: { symbol }, search: { name } });
  };

  const goRoute = (to: (typeof NAV_ITEMS)[number]["to"]) => {
    close();
    void navigate({ to });
  };

  const isSearching = debounced.length >= 2;

  return (
    <Command.Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      label="Command menu"
      shouldFilter={false}
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search a symbol, or jump to…"
        autoFocus
      />
      <Command.List>
        {isSearching ? (
          isFetching && !data ? (
            <Command.Empty>Searching…</Command.Empty>
          ) : (
            <>
              <Command.Empty>No results for “{debounced}”</Command.Empty>
              {(data?.results ?? []).slice(0, 12).map((r) => (
                <Command.Item
                  key={`${r.symbol}-${r.exchange ?? ""}`}
                  value={r.symbol}
                  onSelect={() => goSymbol(r.symbol, r.name)}
                >
                  <span className="cmdk-item-lead">
                    <span style={{ color: "var(--text-primary)" }}>{r.symbol}</span>
                    <span style={{ color: "var(--text-faint)" }}>{r.name}</span>
                  </span>
                  <span className="cmdk-item-hint">{r.exchange ?? ""}</span>
                </Command.Item>
              ))}
            </>
          )
        ) : (
          <>
            <Command.Group heading="Navigate">
              {NAV_ITEMS.map((n) => (
                <Command.Item
                  key={n.to}
                  value={`nav ${n.label}`}
                  onSelect={() => goRoute(n.to)}
                >
                  <span className="cmdk-item-lead">{n.label}</span>
                  <span className="cmdk-item-hint">{n.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {recents.length > 0 && (
              <Command.Group heading="Recent symbols">
                {recents.map((r) => (
                  <Command.Item
                    key={r.symbol}
                    value={`recent ${r.symbol}`}
                    onSelect={() => goSymbol(r.symbol, r.name)}
                  >
                    <span className="cmdk-item-lead">
                      <span style={{ color: "var(--text-primary)" }}>{r.symbol}</span>
                      <span style={{ color: "var(--text-faint)" }}>{r.name}</span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Actions">
              <Command.Item
                value="action toggle theme"
                onSelect={() => {
                  toggleTheme();
                  close();
                }}
              >
                <span className="cmdk-item-lead">Toggle light / dark</span>
                <span className="cmdk-item-hint">Theme</span>
              </Command.Item>
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
