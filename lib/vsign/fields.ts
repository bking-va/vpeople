export type VsignFieldType = "signature" | "initials" | "date" | "text";

export type VsignFieldInput = {
  signerId: string;
  type: VsignFieldType;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  required?: boolean;
  label?: string;
};

/** Signature + date on the last page. Positions are percent of the page from the top-left. */
export function defaultSignatureFields(opts: {
  signerId: string;
  pageCount: number;
}): VsignFieldInput[] {
  const page = Math.max(1, opts.pageCount);
  return [
    {
      signerId: opts.signerId,
      type: "signature",
      page,
      xPct: 12,
      yPct: 78,
      wPct: 38,
      hPct: 10,
      required: true,
      label: "Signature",
    },
    {
      signerId: opts.signerId,
      type: "date",
      page,
      xPct: 55,
      yPct: 78,
      wPct: 30,
      hPct: 8,
      required: true,
      label: "Date",
    },
  ];
}
