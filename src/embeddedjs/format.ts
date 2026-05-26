import { PriceModel } from "./constants";

export function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

export function getPrice(item: PriceModel): number {
  return item.price;
}

export function getTime(item: PriceModel): string {
  return `${pad(item.hour)}:00`;
}

export function formatPrice(price: number): string {
  return `${price.toFixed(2)} c/kWh`;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getHourStart(d: Date): Date {
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
