// Currency -> BIS area code mapping for the "Currency Valuation" (FIN-21)
// feature on Markets → Forex. BIS's WS_EER dataflow keys REER series by
// REF_AREA (mostly ISO 3166-1 country codes; "XM" is the euro area
// aggregate, not any single member country). This list covers every
// currency that appears across the 44 pairs in FOUR PAIRS (server/routes/markets.ts's
// FOREX_PAIRS) — derived from each pair's Yahoo symbol (first/last 3 chars),
// not re-typed by hand.
export type CurrencyArea = {
  code: string; // ISO 4217 currency code, e.g. "USD"
  name: string;
  areaCode: string; // BIS REF_AREA code for WS_EER
  flagCountryCode: string; // ISO 3166-1 alpha-2 for the flag emoji (EUR uses "EU", not "XM")
};

export const CURRENCY_AREAS: CurrencyArea[] = [
  { code: "USD", name: "US Dollar", areaCode: "US", flagCountryCode: "US" },
  { code: "EUR", name: "Euro", areaCode: "XM", flagCountryCode: "EU" },
  { code: "GBP", name: "British Pound", areaCode: "GB", flagCountryCode: "GB" },
  { code: "JPY", name: "Japanese Yen", areaCode: "JP", flagCountryCode: "JP" },
  { code: "CHF", name: "Swiss Franc", areaCode: "CH", flagCountryCode: "CH" },
  { code: "AUD", name: "Australian Dollar", areaCode: "AU", flagCountryCode: "AU" },
  { code: "CAD", name: "Canadian Dollar", areaCode: "CA", flagCountryCode: "CA" },
  { code: "NZD", name: "New Zealand Dollar", areaCode: "NZ", flagCountryCode: "NZ" },
  { code: "INR", name: "Indian Rupee", areaCode: "IN", flagCountryCode: "IN" },
  { code: "CNY", name: "Chinese Yuan", areaCode: "CN", flagCountryCode: "CN" },
  { code: "KRW", name: "South Korean Won", areaCode: "KR", flagCountryCode: "KR" },
  { code: "TRY", name: "Turkish Lira", areaCode: "TR", flagCountryCode: "TR" },
  { code: "BRL", name: "Brazilian Real", areaCode: "BR", flagCountryCode: "BR" },
  { code: "MXN", name: "Mexican Peso", areaCode: "MX", flagCountryCode: "MX" },
  { code: "ZAR", name: "South African Rand", areaCode: "ZA", flagCountryCode: "ZA" },
  { code: "RUB", name: "Russian Ruble", areaCode: "RU", flagCountryCode: "RU" },
  { code: "SGD", name: "Singapore Dollar", areaCode: "SG", flagCountryCode: "SG" },
  { code: "HKD", name: "Hong Kong Dollar", areaCode: "HK", flagCountryCode: "HK" },
  { code: "THB", name: "Thai Baht", areaCode: "TH", flagCountryCode: "TH" },
  { code: "IDR", name: "Indonesian Rupiah", areaCode: "ID", flagCountryCode: "ID" },
  { code: "PHP", name: "Philippine Peso", areaCode: "PH", flagCountryCode: "PH" },
  { code: "MYR", name: "Malaysian Ringgit", areaCode: "MY", flagCountryCode: "MY" },
  { code: "PKR", name: "Pakistani Rupee", areaCode: "PK", flagCountryCode: "PK" },
  { code: "AED", name: "UAE Dirham", areaCode: "AE", flagCountryCode: "AE" },
  { code: "SAR", name: "Saudi Riyal", areaCode: "SA", flagCountryCode: "SA" },
  { code: "EGP", name: "Egyptian Pound", areaCode: "EG", flagCountryCode: "EG" },
  { code: "NGN", name: "Nigerian Naira", areaCode: "NG", flagCountryCode: "NG" },
  { code: "ILS", name: "Israeli Shekel", areaCode: "IL", flagCountryCode: "IL" },
  { code: "NOK", name: "Norwegian Krone", areaCode: "NO", flagCountryCode: "NO" },
  { code: "SEK", name: "Swedish Krona", areaCode: "SE", flagCountryCode: "SE" },
  { code: "DKK", name: "Danish Krone", areaCode: "DK", flagCountryCode: "DK" },
  { code: "PLN", name: "Polish Zloty", areaCode: "PL", flagCountryCode: "PL" },
  { code: "HUF", name: "Hungarian Forint", areaCode: "HU", flagCountryCode: "HU" },
  { code: "CZK", name: "Czech Koruna", areaCode: "CZ", flagCountryCode: "CZ" },
  { code: "CLP", name: "Chilean Peso", areaCode: "CL", flagCountryCode: "CL" },
  { code: "COP", name: "Colombian Peso", areaCode: "CO", flagCountryCode: "CO" },
  { code: "ARS", name: "Argentine Peso", areaCode: "AR", flagCountryCode: "AR" },
  { code: "PEN", name: "Peruvian Sol", areaCode: "PE", flagCountryCode: "PE" },
];
