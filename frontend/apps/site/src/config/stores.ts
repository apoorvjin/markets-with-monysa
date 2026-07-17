export interface StoreLink {
  available: boolean;
  url: string | null;
}

export const storeLinks: Record<"ios" | "android", StoreLink> = {
  ios: { available: false, url: null },
  android: { available: false, url: null },
};
