"use client";

import { useEffect, useRef } from "react";
import { startVendastaSignIn } from "@/app/actions/vendasta-sso";
import { Button } from "@/components/ui/button";

export function VendastaSsoEntry({
  accountId,
  nextUrl,
}: {
  accountId?: string;
  nextUrl: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={startVendastaSignIn} className="space-y-3">
      {accountId ? (
        <input type="hidden" name="account_id" value={accountId} />
      ) : null}
      <input type="hidden" name="nextUrl" value={nextUrl} />
      <p className="text-sm text-muted-foreground">
        Continuing to Vendasta sign-in…
      </p>
      <Button type="submit" className="w-full">
        Continue with Vendasta
      </Button>
    </form>
  );
}
