import { Port } from "piu/MC";
import { state } from "./state";
import { getPrice } from "./format";

export class GraphBehavior {
  onCreate(): void {}

  onDraw(
    port: Port,
    _x: number,
    _y: number,
    _width: number,
    _height: number,
  ): void {
    const {
      futureData,
      selectedIndex,
      cheapestLength,
      cheapestStartIndex,
      minBarIndex,
      maxBarIndex,
    } = state;

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
