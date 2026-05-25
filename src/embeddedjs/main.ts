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
  hour: number;
  price: number;
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
  data: "data",
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
let futureData: PriceModel[] = [];
let selectedIndex = 0;
let cheapestLength = 1;
let cheapestStartIndex = 0;
let minBarIndex = -1;
let maxBarIndex = -1;
let regionIndex = 3; // default FI
let rangeHours = 3;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let messageReady = false;
let pendingRequest = false;
let requestTimeout: ReturnType<typeof setTimeout> | null = null;
let needsRefresh = false;

const message = new Message({
  keys: [
    "REQUEST",
    "REGION",
    "RANGE",
    "STATUS",
    "COUNT",
    "BASE",
    "PRICES",
    "ERROR",
    "SETTINGS",
  ],
  input: 256,
  output: 256,
  onReadable() {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }

    const msg = this.read();
    const newRegion = msg.get("REGION") as string;
    const newRange = msg.get("RANGE") as number;
    if (newRegion || (newRange != null && !isNaN(newRange))) {
      let changed = false;
      if (newRegion) {
        const idx = REGIONS.findIndex((r) => r.code === newRegion);
        if (idx >= 0) {
          regionIndex = idx;
          changed = true;
        }
      }
      if (
        newRange != null &&
        !isNaN(newRange) &&
        newRange >= 1 &&
        newRange <= 24
      ) {
        rangeHours = newRange;
        changed = true;
      }
      if (changed) {
        saveSettings();
        updateMainUI();
        if (isFetching) {
          needsRefresh = true;
        } else {
          requestPrices();
        }
      }
      return;
    }

    const status = msg.get("STATUS");
    if (status === 1) {
      const err = msg.get("ERROR") || "Unknown error";
      priceLabel.string = "Error";
      hourLabel.string = String(err);
      console.log("Fetch error: " + err);
      refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
      isFetching = false;
      if (needsRefresh) {
        needsRefresh = false;
        requestPrices();
      }
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
        prices.push(s === "" ? null : parseInt(s) / 100);
      }

      const newFutureData: PriceModel[] = [];
      for (let i = 0; i < count; i++) {
        const ts = (base + i * 3600) * 1000;
        const d = new Date(ts);
        newFutureData.push({
          hour: d.getHours(),
          price: prices[i] ?? Infinity,
        });
      }

      futureData = newFutureData;
      localStorage.setItem(
        STORAGE_KEYS.data,
        JSON.stringify({ date: formatDate(new Date()), data: futureData }),
      );
      selectedIndex = 0;
      updateMainUI();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Parse error";
      priceLabel.string = "Error";
      hourLabel.string = err;
      console.log("Parse error: " + err);
      refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
    } finally {
      isFetching = false;
      if (needsRefresh) {
        needsRefresh = false;
        requestPrices();
      }
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
  const savedData = localStorage.getItem(STORAGE_KEYS.data);
  if (savedData && savedData.startsWith("{")) {
    const now = new Date();
    const { date, data }: { date: string; data: PriceModel[] } =
      JSON.parse(savedData);

    const [year, month, day] = date.split("-").map((s) => parseInt(s));
    futureData = data.filter(({ hour }) => {
      const then = new Date(year, month, day, hour, 0);
      return then >= now;
    });
  }
} catch (e) {
  // ignore
}

// --- Labels ---
const priceLabel = new Label(null, { style: priceStyle, string: "Loading..." });
const hourLabel = new Label(null, { style: hourStyle, string: "" });
const minLabel = new Label(null, { style: minLabelStyle, string: "" });
const maxLabel = new Label(null, { style: maxLabelStyle, string: "" });
const cheapestLabel = new Label(null, {
  style: cheapestLabelStyle,
  string: "",
});

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
        i >= cheapestStartIndex && i < cheapestStartIndex + cheapestLength;
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

// --- Helpers ---
function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function getPrice(item: PriceModel): number {
  return item.price;
}

function getTime(item: PriceModel): string {
  return `${pad(item.hour)}:00`;
}

function formatPrice(price: Number): string {
  return `${price.toFixed(2)} c/kWh`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function computeCheapestWindow() {
  const n = futureData.length;
  cheapestStartIndex = 0;
  let cheapestStartHour = futureData[0].hour;
  cheapestLength = Math.min(rangeHours, n);

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
      cheapestStartIndex = i;
    }
  }
  const cheapestAvg = minSum / cheapestLength;
  return cheapestAvg;
}

function updateMainUI(): void {
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

  const time = getTime(selected);
  let hourText;

  if (selectedIndex === 0) {
    hourText = `Now (${time})`;
  } else {
    hourText = time;
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
    const minHour = getTime(futureData[minBarIndex]);
    const maxHour = getTime(futureData[maxBarIndex]);
    minLabel.string = `Min: ${formatPrice(minPrice)} @ ${minHour}`;
    maxLabel.string = `Max: ${formatPrice(maxPrice)} @ ${maxHour}`;
  } else {
    minLabel.string = "";
    maxLabel.string = "";
  }

  const cheapestAvg = computeCheapestWindow();
  const cheapestStartTime = getTime(futureData[cheapestStartIndex]);
  cheapestLabel.string = `Cheapest ${cheapestLength} h: ${formatPrice(cheapestAvg)} @ ${cheapestStartTime}`;

  graphPort.invalidate();
}

function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.region, REGIONS[regionIndex].code);
    localStorage.setItem(STORAGE_KEYS.range, String(rangeHours));
  } catch (e) {
    // ignore
  }
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
    if (futureData.length === 0) {
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
        priceLabel.string = "Error";
        hourLabel.string = "Timeout";
        refreshTimeout = setTimeout(requestPrices, 30 * 1000);
      }
    }, 15000);
  } catch (e) {
    isFetching = false;
    const err = e instanceof Error ? e.message : "Send error";
    priceLabel.string = "Error";
    hourLabel.string = err;
    console.log("Request error: " + err);
    refreshTimeout = setTimeout(requestPrices, 5 * 60 * 1000);
  }
}

// --- Buttons ---
new Button({
  types: ["up", "down"],
  onPush(down, type) {
    if (!down) return;
    console.log("Button: " + type);

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
  updateMainUI();
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
