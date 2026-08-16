export interface StoreLink {
  available: boolean;
  url: string | null;
}

export const storeLinks: Record<"ios" | "android" | "web", StoreLink> = {
  ios: { available: true, url: "https://apps.apple.com/app/finbrio/id6783981998" },
  android: { available: false, url: null },
  web: { available: true, url: "https://app.finbrio.net" },
};
