import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCurrency(
  amount: string | number,
  currency: string = "CAD"
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(num);
}

export function calculateTenure(hireDate: string | Date | null): string {
  if (!hireDate) return "";
  const hire = typeof hireDate === "string" ? new Date(hireDate) : hireDate;
  const now = new Date();
  const years = now.getFullYear() - hire.getFullYear();
  const months = now.getMonth() - hire.getMonth();

  let totalMonths = years * 12 + months;
  if (totalMonths < 0) totalMonths = 0;

  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;

  if (y === 0) return `${m} month${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${y} year${y !== 1 ? "s" : ""}`;
  return `${y} year${y !== 1 ? "s" : ""}, ${m} month${m !== 1 ? "s" : ""}`;
}
