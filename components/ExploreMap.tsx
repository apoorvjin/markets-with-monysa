import React from "react";
import { type CountryTariff } from "@/data/tariffs";

interface Props {
  countries: CountryTariff[];
  onSelectCountry: (c: CountryTariff) => void;
  getMarkerColor: (rate: number) => string;
  focusedCode?: string;
}

export default function ExploreMap(_props: Props) {
  return null;
}
