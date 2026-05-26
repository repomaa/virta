import { PriceModel, REGIONS, STORAGE_KEYS } from "./constants";
import { getPrice, formatDate, getHourStart } from "./format";

class State {
  futureData = [] as PriceModel[];
  selectedIndex = 0;
  cheapestLength = 1;
  cheapestStartIndex = 0;
  cheapestAvg = 0;
  minBarIndex = -1;
  maxBarIndex = -1;
  regionIndex = 3;
  rangeHours = 3;
  isFetching = false;
  needsRefresh = false;

  computeCheapestWindow(): void {
    const { futureData, rangeHours } = this;
    const n = futureData.length;
    this.cheapestStartIndex = 0;
    this.cheapestLength = Math.min(rangeHours, n);

    let minSum = Infinity;
    for (let i = 0; i <= n - this.cheapestLength; i++) {
      let sum = 0;
      let valid = true;
      for (let j = 0; j < this.cheapestLength; j++) {
        const p = getPrice(futureData[i + j]);
        if (p == null) {
          valid = false;
          break;
        }
        sum += p;
      }
      if (valid && sum < minSum) {
        minSum = sum;
        this.cheapestStartIndex = i;
      }
    }

    this.cheapestAvg = minSum / this.cheapestLength;
  }

  loadSettings(): void {
    try {
      const savedRegion = localStorage.getItem(STORAGE_KEYS.region);
      if (savedRegion) {
        const idx = REGIONS.findIndex((r) => r.code === savedRegion);
        if (idx >= 0) this.regionIndex = idx;
      }

      const savedRange = localStorage.getItem(STORAGE_KEYS.range);
      if (savedRange) {
        const parsed = parseInt(savedRange, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
          this.rangeHours = parsed;
        }
      }
      const savedData = localStorage.getItem(STORAGE_KEYS.data);
      if (savedData && savedData.startsWith("{")) {
        const now = new Date();
        const { date, data }: { date: string; data: PriceModel[] } =
          JSON.parse(savedData);

        const [year, month, day] = date.split("-").map((s) => parseInt(s));
        this.futureData = data.filter(({ hour }) => {
          const then = new Date(year, month, day, hour, 0);
          return then >= now;
        });

        this.computeCheapestWindow();
      }
    } catch (e) {
      // ignore
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.region, REGIONS[this.regionIndex].code);
      localStorage.setItem(STORAGE_KEYS.range, String(this.rangeHours));
    } catch (e) {
      // ignore
    }
  }
}

export const state = new State();
