import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: props.open && debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const go = (symbol: string, name: string) => {
    props.onOpenChange(false);
    setQuery("");
    void navigate({
      to: "/asset/$symbol",
      params: { symbol },
      search: { name },
    });
  };

  return (
    <Command.Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      label="Search symbols"
      shouldFilter={false}
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search any symbol or company…"
        autoFocus
      />
      <Command.List>
        {debounced.length < 2 ? (
          <Command.Empty>Type at least 2 characters</Command.Empty>
        ) : isFetching && !data ? (
          <Command.Empty>Searching…</Command.Empty>
        ) : (
          <>
            <Command.Empty>No results for “{debounced}”</Command.Empty>
            {(data?.results ?? []).slice(0, 12).map((r) => (
              <Command.Item
                key={`${r.symbol}-${r.exchange ?? ""}`}
                value={r.symbol}
                onSelect={() => go(r.symbol, r.name)}
              >
                <span>
                  <span style={{ color: "var(--text-primary)" }}>{r.symbol}</span>
                  <span style={{ color: "var(--text-faint)", marginLeft: 10 }}>
                    {r.name}
                  </span>
                </span>
                <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-sm)" }}>
                  {r.exchange ?? ""}
                </span>
              </Command.Item>
            ))}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
