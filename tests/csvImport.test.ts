import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCsvText } from "@/ingestion/parsers/parseCsv";
import { parseExcelBuffer } from "@/ingestion/parsers/parseExcel";
import { detectAssetClass } from "@/ingestion/normalizers/detectAssetClass";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { SAMPLE_BROKERAGE_CSV } from "@/ingestion/sampleSources/sampleBrokerageStatement";
import { FIDELITY_STYLE, SCHWAB_STYLE, SWISS_SEMICOLON, VANGUARD_STYLE } from "./fixtures/custodianExports";

const names = (text: string) => parseCsvText(text, "t").account.holdings.map((h) => h.assetName);
const total = (text: string) => parseCsvText(text, "t").account.holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);

describe("CSV import of custodian-style exports", () => {
  it("finds the header below a title line and skips the account-total row", () => {
    const r = parseCsvText(SCHWAB_STYLE, "schwab");
    expect(names(SCHWAB_STYLE)).toEqual(["APPLE INC", "VANGUARD TOTAL STOCK MARKET ETF", "Cash & Cash Investments"]);
    expect(total(SCHWAB_STYLE)).toBeCloseTo(50_555, 2); // equals the file's own Account Total
    expect(r.account.holdings[0]).toMatchObject({
      symbol: "AAPL", quantity: 100, price: 228.5, marketValue: 22_850, costBasis: 15_000, assetClass: "equity",
    });
    expect(r.account.holdings[2].assetClass).toBe("cash");
    // "% Of Account" and "Price Change $" are not the account or the price.
    expect(r.columnMap.account).toBeUndefined();
    expect(r.columnMap.price).toBe("Price");
    expect(r.columnMap.name).toBe("Description");
  });

  it("splits a multi-account file, drops pending activity and the footer disclaimer", () => {
    const r = parseCsvText(FIDELITY_STYLE, "fidelity");
    expect(r.accounts.map((a) => a.accountName)).toEqual(["Individual ···5678", "ROTH IRA ···5432"]);
    expect(r.accounts[1].accountType).toBe("ira_roth");
    expect(r.accounts.map((a) => a.holdings.map((h) => h.symbol))).toEqual([["SPAXX", "MSFT"], ["FXAIX"]]);
    // Fidelity's Type column is Cash/Margin (the account type), not the asset class.
    expect(r.accounts[0].holdings[1].assetClass).not.toBe("cash");
    expect(r.account.holdings).toHaveLength(3);
  });

  it("stops at the end of the positions section", () => {
    expect(names(VANGUARD_STYLE)).toEqual(["VANGUARD FEDERAL MONEY MARKET", "VANGUARD TOTAL BOND MARKET ETF"]);
    expect(total(VANGUARD_STYLE)).toBeCloseTo(16_000.25, 2);
  });

  it("reads semicolon files with European numbers", () => {
    const [nestle, roche] = parseCsvText(SWISS_SEMICOLON, "ch").account.holdings;
    expect(nestle).toMatchObject({ assetName: "Nestlé SA", quantity: 100, price: 95.5, marketValue: 9_550, currency: "CHF" });
    expect(roche.marketValue).toBe(5_202);
  });

  it("still reads the bundled sample", () => {
    const r = parseCsvText(SAMPLE_BROKERAGE_CSV, "sample");
    expect(r.account.holdings.length).toBeGreaterThan(3);
    expect(r.account.holdings.every((h) => h.marketValue !== undefined)).toBe(true);
  });
});

describe("Excel import", () => {
  function workbook(sheets: Record<string, unknown[][]>) {
    const wb = XLSX.utils.book_new();
    for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  it("makes one account per sheet, skips title rows, totals and sheets without positions", () => {
    const buf = workbook({
      Taxable: [
        ["Brokerage statement - Example Household"],
        [],
        ["Ticker", "Security", "Shares", "Price", "Market Value"],
        ["AAPL", "Apple", 10, 228.5, 2285],
        ["Total", null, null, null, 2285],
      ],
      IRA: [["Ticker", "Name", "Units", "Value"], ["BND", "Bond ETF", 100, 7250]],
      Notes: [["Notes"], ["prepared by advisor"]],
    });
    const { accounts, warnings } = parseExcelBuffer(buf, "workbook");
    expect(accounts.map((a) => [a.accountName, a.holdings.map((h) => [h.symbol, h.marketValue])])).toEqual([
      ["Taxable", [["AAPL", 2285]]],
      ["IRA", [["BND", 7250]]],
    ]);
    expect(warnings[0].message).toMatch(/Notes/);
  });

  it("reads numbers, not their display format", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Symbol", "Quantity", "Market Value"], ["VTI", 12.3456, 3581.22]]);
    ws["C2"].z = "$#,##0"; // displayed as "$3,581"
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Positions");
    const { accounts } = parseExcelBuffer(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), "x");
    expect(accounts[0].holdings[0]).toMatchObject({ quantity: 12.3456, marketValue: 3581.22 });
  });
});

describe("saving an import", () => {
  const result = {
    ok: true,
    accounts: parseCsvText(FIDELITY_STYLE, "f").accounts,
    warnings: [],
    extractionMethod: "papaparse",
    extractionMs: 1,
  };

  it("creates one account per extracted account by default", () => {
    const w = extractionToWorkspace(result, { fileName: "positions.csv", reportingCurrency: "USD", sourceType: "csv" });
    expect(w.accounts.map((a) => a.type)).toEqual(["brokerage", "ira_roth"]);
    expect(w.sourceDocument).toMatchObject({ fileName: "positions.csv", sourceType: "csv" });
    expect(new Set(w.holdings.map((h) => h.accountId)).size).toBe(2);
    const msft = w.holdings.find((h) => h.assetName === "MICROSOFT CORP")!;
    expect(msft.assetClass).toBe("equity"); // ticker + shares, no class in the file
    expect(msft.currency).toBe("USD");
    expect(msft.dataQuality.find((d) => d.code === "MISSING_CURRENCY")?.message).toMatch(/assumed USD/);
    expect(w.holdings.every((h) => h.advisorVerification === "unverified")).toBe(true);
  });

  it("puts everything in the chosen account when one is picked", () => {
    const w = extractionToWorkspace(result, { fileName: "p.csv", reportingCurrency: "USD", sourceType: "csv", targetAccountId: "acc_x" });
    expect(w.accounts).toHaveLength(0);
    expect(w.holdings.every((h) => h.accountId === "acc_x")).toBe(true);
  });
});

describe("asset-class keywords match whole words", () => {
  it.each([
    ["MCDONALD'S CORP", undefined],
    ["GOLDMAN SACHS GROUP", undefined],
    ["ULTA BEAUTY", undefined],
    ["12-MONTH CD", "fixed_income"],
    ["ISHARES CORE US AGGREGATE BONDS", "fixed_income"],
    ["SPDR GOLD SHARES", "commodity"],
  ])("%s → %s", (name, cls) => expect(detectAssetClass(name)).toBe(cls));
});
