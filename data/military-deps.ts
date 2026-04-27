export interface MilitaryDep {
  usArmsSharePct: number | null;
  notes: string;
}

export const militaryDeps: Record<string, MilitaryDep> = {
  AU: { usArmsSharePct: 74, notes: "AUKUS partner, major F-35 operator" },
  SA: { usArmsSharePct: 73, notes: "Largest US arms recipient in Middle East" },
  TW: { usArmsSharePct: 70, notes: "Strategic US defense partner" },
  JP: { usArmsSharePct: 65, notes: "Treaty ally, 50,000 US troops stationed" },
  IL: { usArmsSharePct: 66, notes: "Receives $3.8B/yr in US military aid" },
  KW: { usArmsSharePct: 64, notes: "Major Non-NATO ally, hosts US bases" },
  AE: { usArmsSharePct: 61, notes: "Growing US tech platform procurement" },
  QA: { usArmsSharePct: 57, notes: "Hosts Al Udeid Air Base (10,000 US troops)" },
  KR: { usArmsSharePct: 51, notes: "28,500 US troops, joint defense pact" },
  NO: { usArmsSharePct: 52, notes: "NATO ally, F-35 lead customer" },
  CA: { usArmsSharePct: 49, notes: "NORAD partner, NATO ally" },
  NZ: { usArmsSharePct: 46, notes: "Five Eyes partner" },
  JO: { usArmsSharePct: 48, notes: "Receives significant US security assistance" },
  GB: { usArmsSharePct: 44, notes: "NATO ally, special relationship" },
  SG: { usArmsSharePct: 37, notes: "Key Indo-Pacific strategic partner" },
  NL: { usArmsSharePct: 35, notes: "NATO ally, F-35 fleet" },
  IT: { usArmsSharePct: 31, notes: "NATO host, US bases in Sigonella/Aviano" },
  PL: { usArmsSharePct: 38, notes: "Rapidly expanding US military presence" },
  GR: { usArmsSharePct: 29, notes: "NATO ally, significant US procurement" },
  DE: { usArmsSharePct: 28, notes: "NATO ally, US troops at Ramstein" },
  SE: { usArmsSharePct: 30, notes: "New NATO member, increasing US arms buys" },
  TR: { usArmsSharePct: 24, notes: "NATO member, mixed US/Russian procurement" },
  BE: { usArmsSharePct: 22, notes: "NATO HQ host, F-35 buyer" },
  BH: { usArmsSharePct: 55, notes: "Hosts US 5th Fleet" },
  ES: { usArmsSharePct: 19, notes: "NATO ally, US naval base in Rota" },
  PT: { usArmsSharePct: 17, notes: "NATO ally, Azores US base" },
  FR: { usArmsSharePct: 11, notes: "Independent defense, major domestic industry" },
  IN: { usArmsSharePct: 13, notes: "Diversified sourcing; Russia historically dominant" },
  ID: { usArmsSharePct: 12, notes: "Mixed procurement strategy" },
  TH: { usArmsSharePct: 18, notes: "Treaty ally, increasing Chinese procurement" },
  MY: { usArmsSharePct: 15, notes: "Diversified regional sourcing" },
  PH: { usArmsSharePct: 22, notes: "US mutual defense treaty, growing partnership" },
  EG: { usArmsSharePct: 15, notes: "Receives $1.3B/yr in US military aid" },
  MX: { usArmsSharePct: 26, notes: "Merida Initiative, border security cooperation" },
  BR: { usArmsSharePct: 8, notes: "Domestic industry, regional self-reliance" },
  PK: { usArmsSharePct: 9, notes: "Primarily Chinese procurement since 2010s" },
  CN: { usArmsSharePct: 0, notes: "Arms embargo since 1989 Tiananmen" },
  RU: { usArmsSharePct: 0, notes: "Sanctioned; domestic arms industry" },
  IQ: { usArmsSharePct: 31, notes: "Post-2003, US-equipped military" },
  UA: { usArmsSharePct: 62, notes: "Massive US military aid since Feb 2022" },
  OM: { usArmsSharePct: 29, notes: "Strategic Gulf partner" },
  MA: { usArmsSharePct: 17, notes: "Major non-NATO ally since 2004" },
  KE: { usArmsSharePct: 12, notes: "Key Africa counterterrorism partner" },
  CO: { usArmsSharePct: 35, notes: "Major non-NATO ally, Plan Colombia legacy" },
};

export function getUsDependency(code: string): MilitaryDep {
  return militaryDeps[code] ?? { usArmsSharePct: null, notes: "Data not available" };
}
