import {
  Application,
  Column,
  Content,
  Label,
  Port,
  Row,
  Skin,
  Style,
} from "piu/MC";
import Button from "pebble/button";
import Message from "pebble/message";

interface PriceModel {
  DateTime?: string | Date | null;
  PriceNoTax?: number | null;
  PriceWithTax?: number | null;
}

interface Region {
  code: string;
  name: string;
}

const REGIONS: Region[] = [
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

const STORAGE_KEYS = {
  region: "regionCode",
  range: "rangeHours",
};

// --- Styles & Skins ---
const blackSkin = new Skin({ fill: "black" });

const titleStyle = new Style({
  font: "14px Gothic",
  color: "white",
  horizontal: "center",
  top: 2,
});

const priceStyle = new Style({
  font: "24px Gothic",
  color: "#00FFFF",
  horizontal: "center",
  top: 2,
});

const hourStyle = new Style({
  font: "14px Gothic",
  color: "#00FFFF",
  horizontal: "center",
  top: 1,
});

const menuItemSkin = new Skin({ fill: "black" });
const selectedMenuItemSkin = new Skin({ fill: "white" });
const separatorSkin = new Skin({ fill: "#CCCCCC" });

const menuTitleStyle = new Style({
  font: "14px Gothic",
  color: ["white", "black"],
  horizontal: "left",
  top: 2,
});

const menuValueStyle = new Style({
  font: "18px Gothic",
  color: ["white", "black"],
  horizontal: "left",
  top: 0,
});

const cheapestLabelStyle = new Style({
  font: "14px Gothic",
  color: "yellow",
  horizontal: "center",
  top: 0,
});

const minLabelStyle = new Style({
  font: "14px Gothic",
  color: "green",
  horizontal: "center",
  top: 0,
});

const maxLabelStyle = new Style({
  font: "14px Gothic",
  color: "red",
  horizontal: "center",
  top: 0,
});

// --- State ---
let allData: PriceModel[] = [];
let futureData: PriceModel[] = [];
let selectedIndex = 0;
let cheapestStart = -1;
let cheapestLength = 1;
let cheapestStartTime: Date | undefined = undefined;
let cheapestAvg = 0;
let minBarIndex = -1;
let maxBarIndex = -1;
let regionIndex = 3; // default FI
let rangeHours = 3;
let settingsSelection = 0; // 0 = region, 1 = range
let inSettings = false;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let messageReady = false;
let pendingRequest = false;
let requestTimeout: ReturnType<typeof setTimeout> | null = null;

const message = new Message({
  keys: ["REQUEST", "REGION", "RANGE", "STATUS", "COUNT", "BASE", "PRICES", "ERROR"],
  input: 256,
  output: 256,
  onReadable() {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }

    const msg = this.read();
    const status = msg.get("STATUS");
    if (status === 1) {
      const err = msg.get("ERROR") || "Unknown error";
      if (!inSettings) {
        priceLabel.string = "Error";
        hourLabel.string = String(err);
      }
      console.log("Fetch error: " + err);
      refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
      isFetching = false;
      return;
    }

    try {
      const count = msg.get("COUNT") as number;
      const base = msg.get("BASE") as number;
      const pricesStr = msg.get("PRICES") as string;
      if (!count || !pricesStr) {
        throw new Error("Empty response");
      }

      const encodedPrices = pricesStr.split(",");
      const prices: (number | null)[] = [];
      for (let i = 0; i < encodedPrices.length; i++) {
        const s = encodedPrices[i];
        prices.push(s === "" ? null : parseInt(s, 10) / 1000000);
      }

      const newFutureData: PriceModel[] = [];
      for (let i = 0; i < count; i++) {
        const ts = (base + i * 3600) * 1000;
        const d = new Date(ts);
        newFutureData.push({
          DateTime: d,
          PriceWithTax: prices[i] ?? null,
        });
      }

      allData = newFutureData;
      futureData = newFutureData;
      selectedIndex = 0;
      updateMainUI();
      scheduleNextRefresh();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Parse error";
      if (!inSettings) {
        priceLabel.string = "Error";
        hourLabel.string = err;
      }
      console.log("Parse error: " + err);
      refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
    } finally {
      isFetching = false;
    }
  },
  onWritable() {
    messageReady = true;
    if (pendingRequest) {
      pendingRequest = false;
      requestPrices();
    }
  },
  onSuspend() {
    messageReady = false;
  },
});

// Load persisted settings
try {
  const savedRegion = localStorage.getItem(STORAGE_KEYS.region);
  if (savedRegion) {
    const idx = REGIONS.findIndex((r) => r.code === savedRegion);
    if (idx >= 0) regionIndex = idx;
  }
  const savedRange = localStorage.getItem(STORAGE_KEYS.range);
  if (savedRange) {
    const parsed = parseInt(savedRange, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) rangeHours = parsed;
  }
} catch (e) {
  // ignore
}

let regionBeforeSettings = regionIndex;

// --- Labels ---
const priceLabel = new Label(null, { style: priceStyle, string: "Loading..." });
const hourLabel = new Label(null, { style: hourStyle, string: "" });
const minLabel = new Label(null, { style: minLabelStyle, string: "" });
const maxLabel = new Label(null, { style: maxLabelStyle, string: "" });
const cheapestLabel = new Label(null, {
  style: cheapestLabelStyle,
  string: "",
});

// --- Settings UI ---
const regionTitle = new Label(null, {
  style: menuTitleStyle,
  string: "Region",
  state: 1,
});
const regionValue = new Label(null, {
  style: menuValueStyle,
  string: REGIONS[regionIndex].name,
  state: 1,
});
const regionItem = new Column(null, {
  left: 0,
  right: 0,
  top: 0,
  height: 44,
  skin: selectedMenuItemSkin,
  contents: [
    new Content(null, {
      left: 0,
      right: 0,
      top: 0,
      height: 1,
      skin: separatorSkin,
    }),
    new Column(null, {
      left: 8,
      right: 8,
      top: 2,
      bottom: 2,
      contents: [regionTitle, regionValue],
    }),
  ],
});

const rangeTitle = new Label(null, {
  style: menuTitleStyle,
  string: "Range",
  state: 0,
});
const rangeValue = new Label(null, {
  style: menuValueStyle,
  string: `${rangeHours} h`,
  state: 0,
});
const rangeItem = new Column(null, {
  left: 0,
  right: 0,
  top: 0,
  height: 44,
  skin: menuItemSkin,
  contents: [
    new Content(null, {
      left: 0,
      right: 0,
      top: 0,
      height: 1,
      skin: separatorSkin,
    }),
    new Column(null, {
      left: 8,
      right: 8,
      top: 2,
      bottom: 2,
      contents: [rangeTitle, rangeValue],
    }),
  ],
});

let settingsColumn: Column;

// --- Graph Port ---
class GraphBehavior {
  onCreate(): void {}
  onDraw(
    port: Port,
    _x: number,
    _y: number,
    _width: number,
    _height: number,
  ): void {
    const n = futureData.length;
    if (n === 0) return;

    const pw = port.width;
    const ph = port.height;
    const gap = 1;
    const barWidth = Math.max(1, Math.floor((pw - gap * (n - 1)) / n));
    const totalBarsWidth = n * barWidth + (n - 1) * gap;
    const startX = Math.floor((pw - totalBarsWidth) / 2);

    let maxPrice = 0;
    for (let i = 0; i < n; i++) {
      const p = getPrice(futureData[i]);
      if (p != null && p > maxPrice) maxPrice = p;
    }
    if (maxPrice <= 0) maxPrice = 1;

    for (let i = 0; i < n; i++) {
      const bx = startX + i * (barWidth + gap);
      const price = getPrice(futureData[i]);
      const barHeight =
        price != null
          ? Math.max(3, Math.floor((price / maxPrice) * (ph - 8)))
          : 3;
      const by = ph - barHeight - 2;

      const inCheapest =
        cheapestStart >= 0 &&
        i >= cheapestStart &&
        i < cheapestStart + cheapestLength;
      let color = "#555555";
      if (i === selectedIndex) {
        color = "#00FFFF";
      } else if (i === minBarIndex) {
        color = "green";
      } else if (i === maxBarIndex) {
        color = "red";
      } else if (inCheapest) {
        color = "yellow";
      }

      port.fillColor(color, bx, by, barWidth, barHeight);
    }
  }
}

const graphPort = new Port(null, {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  Behavior: GraphBehavior,
}) as Port;

let mainColumn: Column;

const app = new Application(null, {
  skin: blackSkin,
});

const ROUND_TOP_MARGIN = app.width === app.height ? 8 : 0;
const ROUND_BOTTOM_MARGIN = app.width === app.height ? 18 : 0;
graphPort.coordinates = {
  left: ROUND_BOTTOM_MARGIN,
  right: ROUND_BOTTOM_MARGIN,
  top: 0,
  bottom: 0,
};

mainColumn = new Column(null, {
  left: 0,
  right: 0,
  top: ROUND_TOP_MARGIN,
  bottom: ROUND_BOTTOM_MARGIN,
  contents: [
    priceLabel,
    hourLabel,
    graphPort,
    cheapestLabel,
    minLabel,
    maxLabel,
  ],
});
app.add(mainColumn);

settingsColumn = new Column(null, {
  left: 0,
  right: 0,
  top: ROUND_TOP_MARGIN,
  bottom: ROUND_BOTTOM_MARGIN,
  skin: blackSkin,
  contents: [
    regionItem,
    rangeItem,
    new Content(null, {
      left: 0,
      right: 0,
      top: 0,
      height: 1,
      skin: separatorSkin,
    }),
  ],
});

// --- Helpers ---
function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function getPrice(item: PriceModel): number | null {
  if (item.PriceWithTax != null) return item.PriceWithTax;
  return null;
}

function getDate(item: PriceModel): Date | undefined {
  if (item.DateTime == null) return undefined;
  if (item.DateTime instanceof Date) return item.DateTime;
  const dt = item.DateTime as string;
  try {
    const year = parseInt(dt.slice(0, 4), 10);
    const month = parseInt(dt.slice(5, 7), 10) - 1;
    const day = parseInt(dt.slice(8, 10), 10);
    const hour = parseInt(dt.slice(11, 13), 10);
    return new Date(year, month, day, hour, 0, 0);
  } catch {
    return undefined;
  }
}

function formatHours(date?: Date): string {
  return `${pad(date?.getHours() ?? 0)}:00`;
}

function formatPrice(price: Number): string {
  return `${price.toFixed(2)} c/kWh`;
}

function getHourStart(d: Date): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    0,
    0,
    0,
  );
}

function computeCheapestWindow(): void {
  const n = futureData.length;
  cheapestStart = -1;
  cheapestLength = Math.min(rangeHours, n);
  if (n === 0 || rangeHours <= 0) return;

  let minSum = Infinity;
  for (let i = 0; i <= n - cheapestLength; i++) {
    let sum = 0;
    let valid = true;
    for (let j = 0; j < cheapestLength; j++) {
      const p = getPrice(futureData[i + j]);
      if (p == null) {
        valid = false;
        break;
      }
      sum += p;
    }
    if (valid && sum < minSum) {
      minSum = sum;
      cheapestStart = i;
      cheapestStartTime = getDate(futureData[i]);
    }
  }
  cheapestAvg = minSum / cheapestLength;
}

function updateMainUI(): void {
  if (inSettings) return;

  if (futureData.length === 0) {
    priceLabel.string = "N/A";
    hourLabel.string = "No data";
    minLabel.string = "";
    maxLabel.string = "";
    cheapestLabel.string = "";
    graphPort.invalidate();
    return;
  }

  const clampedIndex = Math.min(selectedIndex, futureData.length - 1);
  selectedIndex = clampedIndex;

  const selected = futureData[selectedIndex];
  const price = getPrice(selected);
  priceLabel.string = price != null ? formatPrice(price) : "N/A";

  const dt = getDate(selected);
  let hourText = "";
  if (dt) {
    if (selectedIndex === 0) {
      hourText = `Now (${formatHours(dt)})`;
    } else {
      hourText = formatHours(dt);
    }
  }
  hourLabel.string = hourText;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  minBarIndex = -1;
  maxBarIndex = -1;
  for (let i = 0; i < futureData.length; i++) {
    const p = getPrice(futureData[i]);
    if (p != null) {
      if (p < minPrice) {
        minPrice = p;
        minBarIndex = i;
      }
      if (p > maxPrice) {
        maxPrice = p;
        maxBarIndex = i;
      }
    }
  }
  if (minBarIndex >= 0 && maxBarIndex >= 0) {
    const minDt = getDate(futureData[minBarIndex]);
    const maxDt = getDate(futureData[maxBarIndex]);
    minLabel.string = `Min: ${formatPrice(minPrice)} @ ${formatHours(minDt)}`;
    maxLabel.string = `Max: ${formatPrice(maxPrice)} @ ${formatHours(maxDt)}`;
  } else {
    minLabel.string = "";
    maxLabel.string = "";
  }

  computeCheapestWindow();
  if (cheapestStartTime) {
    cheapestLabel.string = `Cheapest ${cheapestLength} h: ${formatPrice(cheapestAvg)} @ ${formatHours(cheapestStartTime)}`;
  } else {
    cheapestLabel.string = "";
  }

  graphPort.invalidate();
}

function updateSettingsUI(): void {
  regionValue.string = REGIONS[regionIndex].name;
  rangeValue.string = `${rangeHours} h`;
  if (settingsSelection === 0) {
    regionItem.skin = selectedMenuItemSkin;
    regionTitle.state = 1;
    regionValue.state = 1;
    rangeItem.skin = menuItemSkin;
    rangeTitle.state = 0;
    rangeValue.state = 0;
  } else {
    regionItem.skin = menuItemSkin;
    regionTitle.state = 0;
    regionValue.state = 0;
    rangeItem.skin = selectedMenuItemSkin;
    rangeTitle.state = 1;
    rangeValue.state = 1;
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.region, REGIONS[regionIndex].code);
    localStorage.setItem(STORAGE_KEYS.range, String(rangeHours));
  } catch (e) {
    // ignore
  }
}

function enterSettings(): void {
  inSettings = true;
  regionBeforeSettings = regionIndex;
  settingsSelection = 0;
  app.empty();
  app.add(settingsColumn);
  updateSettingsUI();
}

function exitSettings(): void {
  saveSettings();
  inSettings = false;
  app.empty();
  app.add(mainColumn);
  if (regionBeforeSettings !== regionIndex) {
    requestPrices();
  } else {
    computeCheapestWindow();
    updateMainUI();
  }
}

function scheduleNextRefresh(): void {
  const now = new Date();
  const nextHour = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours() + 1,
    1,
    0,
  );
  const delay = nextHour.getTime() - now.getTime();
  console.log(`Next refresh in ${(delay / 1000 / 60).toFixed(1)} min`);
  refreshTimeout = setTimeout(requestPrices, delay);
}

let isFetching = false;

function requestPrices(): void {
  if (isFetching) return;

  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }

  try {
    console.log("Requesting prices...");
    if (!inSettings) {
      priceLabel.string = "Fetching...";
      hourLabel.string = "";
    }

    if (!messageReady) {
      pendingRequest = true;
      return;
    }

    isFetching = true;
    pendingRequest = false;

    const map = new Map<string, string | number>([
      ["REQUEST", 1],
      ["REGION", REGIONS[regionIndex].code],
      ["RANGE", rangeHours],
    ]);
    message.write(map);

    if (requestTimeout) clearTimeout(requestTimeout);
    requestTimeout = setTimeout(() => {
      if (isFetching) {
        isFetching = false;
        console.log("Request timeout");
        if (!inSettings) {
          priceLabel.string = "Error";
          hourLabel.string = "Timeout";
        }
        refreshTimeout = setTimeout(requestPrices, 30 * 1000);
      }
    }, 15000);
  } catch (e) {
    isFetching = false;
    const err = e instanceof Error ? e.message : "Send error";
    if (!inSettings) {
      priceLabel.string = "Error";
      hourLabel.string = err;
    }
    console.log("Request error: " + err);
    refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
  }
}

// --- Buttons ---
const button = new Button({
  types: ["up", "down", "select", "back"],
  onPush(down: number, type: string): void {
    if (!down) return;
    console.log("Button: " + type);

    if (type === "select" && !inSettings) {
      enterSettings();
      return;
    }

    if (inSettings) {
      if (type === "back") {
        exitSettings();
        return;
      }

      if (type === "select") {
        settingsSelection = settingsSelection === 0 ? 1 : 0;
        updateSettingsUI();
        return;
      }

      if (settingsSelection === 0) {
        // Region
        if (type === "up") {
          regionIndex = (regionIndex + 1) % REGIONS.length;
        } else if (type === "down") {
          regionIndex = (regionIndex - 1 + REGIONS.length) % REGIONS.length;
        }
      } else {
        // Range
        if (type === "up") {
          rangeHours = Math.min(24, rangeHours + 1);
        } else if (type === "down") {
          rangeHours = Math.max(1, rangeHours - 1);
        }
      }
      updateSettingsUI();
      return;
    }

    // Main view navigation
    if (futureData.length === 0) return;

    if (type === "up") {
      selectedIndex = Math.max(0, selectedIndex - 1);
    } else if (type === "down") {
      selectedIndex = Math.min(futureData.length - 1, selectedIndex + 1);
    }

    updateMainUI();
  },
});

// --- Lifecycle ---
function onReady(): void {
  console.log("Ready. PebbleKit connected: " + watch.connected.pebblekit);
  if (watch.connected.pebblekit) {
    requestPrices();
  }
}

watch.addEventListener("connected", (): void => {
  if (watch.connected.pebblekit) {
    requestPrices();
  }
});

watch.addEventListener("hourchange", (): void => {
  console.log("Hour changed, refreshing");
  requestPrices();
});

onReady();

export default app;
