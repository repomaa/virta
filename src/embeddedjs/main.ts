import { Application, Column, Label, Port } from "piu/MC";
import Button from "pebble/button";
import Message from "pebble/message";

import { REGIONS, STORAGE_KEYS, PriceModel } from "./constants";
import {
  blackSkin,
  priceStyle,
  hourStyle,
  minLabelStyle,
  maxLabelStyle,
  cheapestLabelStyle,
} from "./styles";
import { state } from "./state";
import { getPrice, getTime, formatPrice, formatDate } from "./format";
import { GraphBehavior } from "./graph";
import { Messenger } from "./messenger";

// --- UI Labels ---
const priceLabel = new Label(null, { style: priceStyle, string: "Loading..." });
const hourLabel = new Label(null, { style: hourStyle, string: "" });
const minLabel = new Label(null, { style: minLabelStyle, string: "" });
const maxLabel = new Label(null, { style: maxLabelStyle, string: "" });
const cheapestLabel = new Label(null, {
  style: cheapestLabelStyle,
  string: "",
});

// --- Graph Port ---
const graphPort = new Port(null, {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  Behavior: GraphBehavior,
}) as Port;

// --- Application Assembly ---
let mainColumn: Column;

const app = new Application(null, { skin: blackSkin });

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

// --- UI Update ---
function updateMainUI(): void {
  if (state.futureData.length === 0) {
    priceLabel.string = "Fetching...";
    hourLabel.string = "";
    minLabel.string = "";
    maxLabel.string = "";
    cheapestLabel.string = "";
    graphPort.invalidate();
    return;
  }

  state.selectedIndex = Math.min(
    state.selectedIndex,
    state.futureData.length - 1,
  );

  const selected = state.futureData[state.selectedIndex];
  const price = getPrice(selected);
  priceLabel.string = price != null ? formatPrice(price) : "N/A";

  const time = getTime(selected);
  hourLabel.string = state.selectedIndex === 0 ? `Now (${time})` : time;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  state.minBarIndex = -1;
  state.maxBarIndex = -1;

  for (let i = 0; i < state.futureData.length; i++) {
    const p = getPrice(state.futureData[i]);
    if (p != null) {
      if (p < minPrice) {
        minPrice = p;
        state.minBarIndex = i;
      }
      if (p > maxPrice) {
        maxPrice = p;
        state.maxBarIndex = i;
      }
    }
  }

  if (state.minBarIndex >= 0 && state.maxBarIndex >= 0) {
    minLabel.string = `Min: ${formatPrice(minPrice)} @ ${getTime(state.futureData[state.minBarIndex])}`;
    maxLabel.string = `Max: ${formatPrice(maxPrice)} @ ${getTime(state.futureData[state.maxBarIndex])}`;
  } else {
    minLabel.string = "";
    maxLabel.string = "";
  }

  cheapestLabel.string = `Cheapest ${state.rangeHours} h: ${formatPrice(state.cheapestAvg)} @ ${getTime(state.futureData[state.cheapestStartIndex])}`;

  graphPort.invalidate();
}

const messenger = new Messenger({
  onError(err) {
    priceLabel.string = "Error";
    hourLabel.string = err;
  },
  onData() {
    updateMainUI();
  },
});

// --- Buttons ---
new Button({
  types: ["up", "down"],
  onPush(down, type) {
    if (!down) return;
    console.log("Button: " + type);

    if (state.futureData.length === 0) return;

    if (type === "up") {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    } else if (type === "down") {
      state.selectedIndex = Math.min(
        state.futureData.length - 1,
        state.selectedIndex + 1,
      );
    }

    updateMainUI();
  },
});

// --- Lifecycle ---
function onReady(): void {
  state.loadSettings();
  updateMainUI();
}

watch.addEventListener("connected", (): void => {
  if (watch.connected.pebblekit) {
    messenger.requestPrices();
  }
});

watch.addEventListener("hourchange", (): void => {
  console.log("Hour changed, refreshing");
  if (watch.connected.pebblekit) {
    messenger.requestPrices();
  }
});

onReady();

export default app;
