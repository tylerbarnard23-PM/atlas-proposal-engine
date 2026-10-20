"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import type { Account, Holding } from "@/domain/types";

// "Upload positions" on a balance-only account opens the Import Center with
// ?account=<id>&replace=<holdingId>: the upload goes into that account and
// replaces the single balance it was imported with.
export interface ImportTarget {
  account?: Account;
  replace?: Holding;
}

export function useImportTarget(): ImportTarget {
  const accounts = useAtlasStore((s) => s.accounts);
  const holdings = useAtlasStore((s) => s.holdings);
  const [ids, setIds] = React.useState<{ account?: string; replace?: string }>({});
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setIds({ account: p.get("account") ?? undefined, replace: p.get("replace") ?? undefined });
  }, []);
  const account = accounts.find((a) => a.id === ids.account);
  const replace = holdings.find((h) => h.id === ids.replace && h.accountId === ids.account);
  return { account, replace };
}
