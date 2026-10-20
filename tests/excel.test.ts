import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "@/ingestion/parsers/parseExcel";

// Builds a real .xlsx in memory, so the test exercises the same SheetJS read
// path an uploaded statement takes.
function workbook(sheets: Record<string, (string | number)[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseExcelBuffer", () => {
  it("extracts holdings from every sheet", () => {
    const buf = workbook({
      Brokerage: [
        ["Symbol", "Description", "Quantity", "Price", "Market Value", "Currency"],
        ["AAPL", "Apple Inc.", 100, 224.18, 22418, "USD"],
        ["MSFT", "Microsoft Corporation", 50, 462.73, 23136.5, "USD"],
      ],
      "Swiss Bank": [
        ["Symbol", "Description", "Quantity", "Market Value", "Currency"],
        ["NESN.SW", "Nestle SA", 2200, 193864, "CHF"],
      ],
    });
    const { accounts, sheetNames } = parseExcelBuffer(buf);
    expect(sheetNames).toEqual(["Brokerage", "Swiss Bank"]);
    expect(accounts).toHaveLength(2);

    const [brokerage, swiss] = accounts;
    expect(brokerage.holdings.map((h) => [h.symbol, h.marketValue, h.currency])).toEqual([
      ["AAPL", 22418, "USD"],
      ["MSFT", 23136.5, "USD"],
    ]);
    expect(swiss.holdings[0]).toMatchObject({ symbol: "NESN.SW", marketValue: 193864, currency: "CHF" });
  });

  it("does not let a __proto__ header pollute Object.prototype", () => {
    const buf = workbook({ Sheet1: [["__proto__", "Market Value"], ["polluted", 1]] });
    parseExcelBuffer(buf);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
