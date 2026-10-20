import * as XLSX from "xlsx";
import { parseCsvText } from "./parseCsv";
import type { DataQualityIssue, ExtractedAccount } from "@/domain/types";

// One account per sheet (or per account-column value within a sheet). Sheets
// with no positions, such as notes or a cover page, are skipped and named in
// a warning rather than arriving as empty accounts.
export function parseExcelBuffer(
  buffer: ArrayBuffer | Buffer,
  accountHint?: string
): { accounts: ExtractedAccount[]; sheetNames: string[]; warnings: DataQualityIssue[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;
  const accounts: ExtractedAccount[] = [];
  const skipped: string[] = [];
  const multiSheet = sheetNames.length > 1;
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    // rawNumbers: read 1234.5, not the cell's display format ("$1,234.50").
    const csv = XLSX.utils.sheet_to_csv(sheet, { rawNumbers: true, blankrows: true });
    const { accounts: sheetAccounts } = parseCsvText(csv, multiSheet ? name : accountHint ?? name);
    const withHoldings = sheetAccounts.filter((a) => a.holdings.length > 0);
    if (withHoldings.length === 0) skipped.push(name);
    accounts.push(...withHoldings.map((a) => ({ ...a, accountName: a.accountName ?? name })));
  }
  const warnings: DataQualityIssue[] = skipped.length
    ? [{ code: "ADVISOR_EDITED_VALUE", severity: "info", message: `No positions found on sheet(s): ${skipped.join(", ")}.` }]
    : [];
  return { accounts, sheetNames, warnings };
}
