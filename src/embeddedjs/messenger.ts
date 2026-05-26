import Message from "pebble/message";
import { PriceModel, REGIONS, STORAGE_KEYS } from "./constants";
import { state } from "./state";
import { formatDate } from "./format";

export class Messenger {
  private messageReady = false;
  private pendingRequest = false;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private requestTimeout: ReturnType<typeof setTimeout> | null = null;
  private onError: (err: string) => void = () => {};
  private onData: () => void = () => {};
  private message: Message;

  constructor({
    onError,
    onData,
  }: {
    onError: (err: string) => void;
    onData: () => void;
  }) {
    this.onError = onError;
    this.onData = onData;
    const self = this;
    this.message = new Message({
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
        self.handleReadable();
      },
      onWritable() {
        self.handleWritable();
      },
      onSuspend() {
        self.handleSuspend();
      },
    });
  }

  private handleReadable() {
    if (this.requestTimeout) {
      clearTimeout(this.requestTimeout);
      this.requestTimeout = null;
    }

    const msg = this.message.read();

    if (this.handleSettingsMessage(msg)) return;
    if (this.handleErrorMessage(msg)) return;

    this.handleDataMessage(msg);
  }

  private handleWritable() {
    this.messageReady = true;
    if (this.pendingRequest) {
      this.pendingRequest = false;
      this.requestPrices();
    }
  }

  private handleSuspend() {
    this.messageReady = false;
  }

  private handleSettingsMessage(msg: any): boolean {
    const newRegion = msg.get("REGION") as string;
    const newRange = msg.get("RANGE") as number;

    if (!newRegion && (newRange == null || isNaN(newRange))) {
      return false;
    }

    let changed = false;

    if (newRegion) {
      const idx = REGIONS.findIndex((r) => r.code === newRegion);
      if (idx >= 0) {
        state.regionIndex = idx;
        changed = true;
      }
    }

    if (
      newRange != null &&
      !isNaN(newRange) &&
      newRange >= 1 &&
      newRange <= 24
    ) {
      state.rangeHours = newRange;
      changed = true;
    }

    if (changed) {
      state.saveSettings();
      this.onData();
      if (state.isFetching) {
        state.needsRefresh = true;
      } else {
        this.requestPrices();
      }
    }

    return true;
  }

  private handleErrorMessage(msg: any): boolean {
    const status = msg.get("STATUS");
    if (status !== 1) return false;

    const err = msg.get("ERROR") || "Unknown error";
    this.onError(err);
    this.refreshTimeout = setTimeout(() => this.requestPrices(), 5 * 60 * 1000);

    console.log("Error: " + err);
    state.isFetching = false;
    if (state.needsRefresh) {
      state.needsRefresh = false;
      this.requestPrices();
    }
    return true;
  }

  requestPrices(): void {
    if (state.isFetching) return;

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }

    try {
      console.log("Requesting prices...");

      if (!this.messageReady) {
        this.pendingRequest = true;
        return;
      }

      state.isFetching = true;
      this.pendingRequest = false;

      const map = new Map<string, string | number>([
        ["REQUEST", 1],
        ["REGION", REGIONS[state.regionIndex].code],
        ["RANGE", state.rangeHours],
      ]);
      this.message.write(map);

      if (this.requestTimeout) clearTimeout(this.requestTimeout);
      this.requestTimeout = setTimeout(() => {
        if (state.isFetching) {
          state.isFetching = false;
          console.log("Request timeout");
          this.onError("Timeout");
          this.refreshTimeout = setTimeout(
            () => this.requestPrices(),
            30 * 1000,
          );
        }
      }, 15000);
    } catch (e) {
      state.isFetching = false;
      const err = e instanceof Error ? e.message : "Send error";
      this.onError(err);
      console.log("Request error: " + err);
      this.refreshTimeout = setTimeout(this.requestPrices, 5 * 60 * 1000);
    }
  }

  private handleDataMessage(msg: any): void {
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

      state.futureData = newFutureData;
      localStorage.setItem(
        STORAGE_KEYS.data,
        JSON.stringify({
          date: formatDate(new Date()),
          data: state.futureData,
        }),
      );
      state.selectedIndex = 0;
      state.computeCheapestWindow();
      this.onData();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Parse error";
      this.onError(err);
      console.log("Parse error: " + err);
      this.refreshTimeout = setTimeout(
        () => this.requestPrices(),
        5 * 60 * 1000,
      );
    } finally {
      state.isFetching = false;
      if (state.needsRefresh) {
        state.needsRefresh = false;
        this.requestPrices();
      }
    }
  }
}
