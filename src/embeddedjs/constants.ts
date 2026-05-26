export interface PriceModel {
  hour: number;
  price: number;
}

export interface Region {
  code: string;
  name: string;
}

export const REGIONS: Region[] = [
  { code: "DK1", name: "DK1 West" },
  { code: "DK2", name: "DK2 East" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "NO1", name: "NO1 Ost" },
  { code: "NO2", name: "NO2 Sor" },
  { code: "NO3", name: "NO3 Mid" },
  { code: "NO4", name: "NO4 Nord" },
  { code: "NO5", name: "NO5 Vest" },
  { code: "SE1", name: "SE1 Lulea" },
  { code: "SE2", name: "SE2 Sundsvall" },
  { code: "SE3", name: "SE3 Stockholm" },
  { code: "SE4", name: "SE4 Malmo" },
];

export const STORAGE_KEYS = {
  region: "regionCode",
  range: "rangeHours",
  resolution: "resolution",
  data: "data",
};
