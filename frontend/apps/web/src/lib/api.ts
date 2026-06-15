import { createApiClient } from "@monysa/api-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

// Local dev hits the local Express server (port 5001 — never 5000);
// production builds default to the Fly deployment.
const baseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:5001" : "https://monysa-api.fly.dev");

export const api = createApiClient({ baseUrl });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 3600_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// localStorage persistence replicates the mobile DiskCache
// hydrate-stale-then-refresh pattern: cached pages render instantly on
// cold start while the network refetch runs.
persistQueryClient({
  queryClient,
  persister: createSyncStoragePersister({
    storage: window.localStorage,
    key: "monysa-query-cache",
  }),
  maxAge: 24 * 3600_000,
  // Bump when any contract shape changes (mirror of DiskCache._schemaVersion).
  buster: "v1",
});
