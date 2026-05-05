import * as XLSX from "xlsx";
import { parseCsvText } from "./parseCsv";
import type { ExtractedAccount } from "@/domain/types";

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer, accountHint?: string): { accounts: ExtractedAccount[]; sheetNames: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;
  const accounts: ExtractedAccount[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const { account } = parseCsvText(csv, accountHint ?? name);
    accounts.push({ ...account, accountName: account.accountName ?? name });
  }
  return { accounts, sheetNames };
}
