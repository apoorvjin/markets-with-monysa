export interface StoreLink {
  available: boolean;
  url: string | null;
}

export const storeLinks: Record<"ios" | "android" | "web", StoreLink> = {
  ios: { available: false, url: null },
  android: { available: false, url: null },
  web: { available: false, url: null },
};
