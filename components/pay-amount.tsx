import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  type FxRateMap,
  usdEquivalentAttribution,
  usdEquivalentForVisiblePay,
} from "@/lib/fx";

export function PayAmount({
  amount,
  currency,
  visible,
  rates,
  formatted,
  suffix,
}: {
  amount: string | number | null | undefined;
  currency?: string | null;
  visible: boolean;
  rates: FxRateMap;
  formatted?: string | null;
  suffix?: ReactNode;
}) {
  if (amount == null || amount === "") {
    return (
      <>
        —
        {suffix ? <> {suffix}</> : null}
      </>
    );
  }

  const code = currency || "CAD";
  const original = formatted ?? formatCurrency(amount, code);
  const usd = usdEquivalentForVisiblePay({
    visible,
    amount,
    currency: code,
    rates,
  });

  if (!usd || usd.isIdentity) {
    return (
      <>
        {original}
        {suffix ? <> {suffix}</> : null}
      </>
    );
  }

  return (
    <>
      {original}{" "}
      <span
        className="text-muted-foreground text-sm font-normal"
        title={usdEquivalentAttribution(usd)}
      >
        (≈ {formatCurrency(usd.amountUsd, "USD")})
      </span>
      {suffix ? <> {suffix}</> : null}
    </>
  );
}

export function FxRatesFootnote({ rates }: { rates: FxRateMap }) {
  const usd = rates.get("USD");
  if (!usd) {
    return (
      <p className="text-xs text-muted-foreground">
        USD equivalents appear when a Bank of Canada daily rate is on file. Missing rates are
        never filled in.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      USD equivalents use the latest Bank of Canada daily rate (as of {usd.rateDate}), including
      for historical rows — not the FX rate on each effective date. Hover a USD figure for the
      rate and source. Amounts already in USD are shown once.
    </p>
  );
}
