"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { EmptyState } from "@/components/ui/EmptyState";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { ACCOUNT_TYPE_GROUPS, ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { CURRENCIES } from "@/domain/currencyConfigs";
import { COUNTRIES } from "@/domain/countryConfigs";
import { SAMPLE_BROKERAGE_CSV } from "@/ingestion/sampleSources/sampleBrokerageStatement";
import { SAMPLE_MESSY_TEXT } from "@/ingestion/sampleSources/sampleMessyStatement";
import { SAMPLE_CRYPTO_WALLET } from "@/ingestion/sampleSources/sampleCryptoWalletScreenshot";
import { SAMPLE_RETIREMENT_CSV } from "@/ingestion/sampleSources/sampleRetirementStatement";
import { formatCurrency, safeId, todayIso } from "@/utils/formatting";
import { PdfImport } from "@/components/import/PdfImport";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { useImportTarget } from "@/components/import/importTarget";
import type {
  Account,
  AccountType,
  ExtractedHolding,
  Holding,
  SourceDocument,
  SourceType,
  ExtractionResult,
  ExtractedAccount,
} from "@/domain/types";
import { Upload, FileSpreadsheet, FileText, Image as ImageIcon, ClipboardPaste, FilePlus2, ChevronRight } from "lucide-react";

export default function ImportCenterPage() {
  return (
    <ClientOnly>
      <ImportCenterInner />
    </ClientOnly>
  );
}

type Mode = "manual" | "csv" | "excel" | "pdf" | "image" | "paste" | "ofx";

function ImportCenterInner() {
  const [mode, setMode] = React.useState<Mode>("paste");
  const target = useImportTarget();
  // Arriving to add positions to one account: start on the CSV tab.
  React.useEffect(() => {
    if (target.account) setMode("csv");
  }, [target.account]);

  return (
    <>
      <PageHeader
        eyebrow="Statement & Data Intake"
        title="Import Center"
        description="Bring holdings into the engagement from any practical source. Every extracted row is reviewable before it enters the proposal."
        actions={
          <a href="/statement-workbench">
            <Button variant="secondary" iconRight={<ChevronRight className="h-4 w-4" />}>
              Open Workbench
            </Button>
          </a>
        }
      />

      <IngestErrorBanner />

      {target.account && (
        <div role="status" className="mb-4 rounded-md bg-navy-50 ring-1 ring-inset ring-navy-200 px-4 py-3 text-[13px] text-ink-800">
          <div className="font-semibold text-navy-800">Adding positions to {target.account.name}</div>
          <p className="mt-0.5 text-ink-700">
            Upload this account&apos;s statement as CSV, Excel or PDF, or paste its holdings table.
            {target.replace && (
              <>
                {" "}When you save, its single balance of{" "}
                <span className="font-medium tabular">{formatCurrency(target.replace.nativeMarketValue, target.replace.currency)}</span> is replaced by the
                positions.
              </>
            )}
          </p>
        </div>
      )}

      <Tabs
        active={mode}
        onChange={(k) => setMode(k as Mode)}
        tabs={[
          { key: "paste", label: "Paste table" },
          { key: "csv", label: "CSV" },
          { key: "excel", label: "Excel" },
          { key: "pdf", label: "PDF statement" },
          { key: "image", label: "Screenshot / image" },
          { key: "ofx", label: "OFX / QFX" },
          { key: "manual", label: "Manual entry" },
        ]}
        className="mb-5"
      />

      {mode === "paste" && <PasteIngestion />}
      {mode === "csv" && <CsvIngestion />}
      {mode === "excel" && <ExcelIngestion />}
      {mode === "pdf" && <PdfImport />}
      {mode === "image" && <BinaryIngestion sourceType="image_screenshot" hint="OCR via Tesseract — best for clean screenshots from custodian portals or wallet apps." accept="image/*" />}
      {mode === "ofx" && <OfxIngestion />}
      {mode === "manual" && <ManualEntry />}

      <SectionDivider>Quickstart Samples</SectionDivider>
      <p className="text-sm text-ink-500 mb-3">
        These samples come from the seed dataset. Click one to load it into the active ingestion tab.
      </p>
      <SamplesPanel
        onLoad={(text) => {
          if (mode === "csv") setCsvText(text);
          else if (mode === "paste") setPastedText(text);
          else if (mode === "ofx") setOfxText(text);
          else setMode("paste");
        }}
      />
    </>
  );
}

// Hoisted state for sample loading (across components above)
let setPastedTextRef: ((s: string) => void) | null = null;
let setCsvTextRef: ((s: string) => void) | null = null;
let setOfxTextRef: ((s: string) => void) | null = null;

function setPastedText(s: string) { setPastedTextRef?.(s); }
function setCsvText(s: string) { setCsvTextRef?.(s); }
function setOfxText(s: string) { setOfxTextRef?.(s); }

function SamplesPanel({ onLoad }: { onLoad: (text: string) => void }) {
  const samples = [
    { name: "Brokerage CSV", text: SAMPLE_BROKERAGE_CSV },
    { name: "Retirement CSV", text: SAMPLE_RETIREMENT_CSV },
    { name: "Swiss private bank (messy paste)", text: SAMPLE_MESSY_TEXT },
    { name: "Crypto wallet screenshot text", text: SAMPLE_CRYPTO_WALLET },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {samples.map((s) => (
        <Card key={s.name}>
          <CardBody>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-medium text-ink-900">{s.name}</div>
              <Badge tone="navy">SAMPLE</Badge>
            </div>
            <pre className="text-[10px] text-ink-500 mt-2 max-h-20 overflow-hidden">{s.text.slice(0, 200)}...</pre>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => onLoad(s.text)}>
              Load into tab
            </Button>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function PasteIngestion() {
  const [text, setText] = React.useState("");
  setPastedTextRef = setText;
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResult | null>(null);
  const [accountHint, setAccountHint] = React.useState("Pasted Holdings");

  async function run() {
    setBusy(true);
    try {
      setResult(await postIngest({ sourceType: "pasted_text" as SourceType, text, fileName: accountHint }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Paste Table or Unstructured Holdings</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Label>Account label</Label>
            <Input value={accountHint} onChange={(e) => setAccountHint(e.target.value)} />
          </div>
        </div>
        <Label>Paste text</Label>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a brokerage table, screenshot text, or copied positions..." />
        <Button onClick={run} loading={busy} disabled={!text}>Extract holdings</Button>
        {result && <ExtractionPreview result={result} />}
      </CardBody>
    </Card>
  );
}

function CsvIngestion() {
  const [text, setText] = React.useState("");
  setCsvTextRef = setText;
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResult | null>(null);
  const [accountHint, setAccountHint] = React.useState("CSV Import");
  const [file, setFile] = React.useState<{ name: string; size: number } | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await postIngest({ sourceType: "csv" as SourceType, text, fileName: accountHint }));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    setAccountHint(f.name.replace(/\.(csv|tsv|txt)$/i, ""));
    setFile({ name: f.name, size: f.size });
    setResult(null);
  }

  return (
    <Card>
      <CardHeader><CardTitle>CSV / TSV Upload or Paste</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Account label</Label>
            <Input value={accountHint} onChange={(e) => setAccountHint(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Upload CSV file</Label>
            <Input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={onFile} />
          </div>
        </div>
        <Label>or paste CSV text</Label>
        <Textarea rows={10} value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} />
        <Button onClick={run} loading={busy} disabled={!text}>Extract holdings</Button>
        {result && <ExtractionPreview result={result} fileName={file?.name ?? `${accountHint} (pasted)`} sizeBytes={file?.size} />}
      </CardBody>
    </Card>
  );
}

function ExcelIngestion() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResult | null>(null);
  const [hint, setHint] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  async function run(file: File) {
    setBusy(true);
    setResult(null);
    setFile(file);
    try {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      setResult(
        await postIngest({ sourceType: "excel" as SourceType, contentBase64: base64, fileName: hint || file.name.replace(/\.(xlsx|xls|xlsm)$/i, "") })
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Excel Workbook Upload</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <Label>Account label (single-sheet workbooks)</Label>
        <Input value={hint} placeholder="Defaults to the file name; multi-sheet workbooks use each sheet's name" onChange={(e) => setHint(e.target.value)} />
        <Label>Workbook</Label>
        <Input
          type="file"
          accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // choosing the same file again re-runs it
            if (f) run(f);
          }}
        />
        <div className="text-2xs text-ink-500">One account per sheet (or per account number within a sheet). Title rows and totals are skipped.</div>
        {busy && <div className="text-sm text-ink-500">Parsing workbook…</div>}
        {result && <ExtractionPreview result={result} fileName={file?.name} sizeBytes={file?.size} />}
      </CardBody>
    </Card>
  );
}

function BinaryIngestion({
  sourceType,
  accept,
  hint,
}: {
  sourceType: SourceType;
  accept: string;
  hint: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResult | null>(null);
  const [label, setLabel] = React.useState("Statement");

  async function run(file: File) {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      setResult(await postIngest({ sourceType, contentBase64: base64, fileName: label || file.name, contentType: file.type }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{sourceType === "image_screenshot" ? "Screenshot / Image OCR" : "PDF Statement"}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-500">{hint}</p>
        <Label>Account label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        <Label>File</Label>
        <Input type="file" accept={accept} onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
        {busy && <div className="text-sm text-ink-500">{sourceType === "image_screenshot" ? "Running OCR…" : "Extracting text…"}</div>}
        {result && <ExtractionPreview result={result} />}
      </CardBody>
    </Card>
  );
}

function OfxIngestion() {
  const [text, setText] = React.useState("");
  setOfxTextRef = setText;
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await postIngest({ sourceType: "ofx_qfx" as SourceType, text }));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
  }

  return (
    <Card>
      <CardHeader><CardTitle>OFX / QFX Export</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <Label>Upload .ofx / .qfx</Label>
        <Input type="file" accept=".ofx,.qfx,text/plain" onChange={onFile} />
        <Label>or paste content</Label>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="<OFX>..." />
        <Button onClick={run} loading={busy} disabled={!text}>Extract holdings</Button>
        {result && <ExtractionPreview result={result} />}
      </CardBody>
    </Card>
  );
}

function ManualEntry() {
  const accounts = useAtlasStore((s) => s.accounts);
  const upsertAccount = useAtlasStore((s) => s.upsertAccount);
  const upsertHolding = useAtlasStore((s) => s.upsertHolding);
  const client = useAtlasStore((s) => s.client);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [symbol, setSymbol] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [country, setCountry] = React.useState("US");
  const [assetClass, setAssetClass] = React.useState("equity");
  const [marketValue, setMarketValue] = React.useState("");
  const [costBasis, setCostBasis] = React.useState("");
  const [valuationDate, setValuationDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [advisorNotes, setAdvisorNotes] = React.useState("");

  // Quick add account form
  const [newAcctName, setNewAcctName] = React.useState("");
  const [newAcctType, setNewAcctType] = React.useState<AccountType>("brokerage");
  const [newAcctInst, setNewAcctInst] = React.useState("");
  const [newAcctCurrency, setNewAcctCurrency] = React.useState("USD");

  function quickAddAccount() {
    if (!newAcctName) return;
    const a: Account = {
      id: safeId("acc"),
      name: newAcctName,
      type: newAcctType,
      institution: newAcctInst || undefined,
      baseCurrency: newAcctCurrency,
      country: client.reportingCountry,
      asOf: valuationDate,
      createdAt: todayIso(),
      updatedAt: todayIso(),
      isLiabilityAccount: newAcctType === "liability_account",
    };
    upsertAccount(a);
    setAccountId(a.id);
    setNewAcctName("");
    setNewAcctInst("");
  }

  function save() {
    if (!accountId || !name) return;
    const qty = quantity ? Number(quantity) : undefined;
    const px = price ? Number(price) : undefined;
    const mv = marketValue ? Number(marketValue) : qty != null && px != null ? qty * px : 0;
    const h: Holding = {
      id: safeId("h"),
      accountId,
      assetName: name,
      identifier: symbol ? { type: "ticker", value: symbol.toUpperCase() } : undefined,
      assetClass: assetClass as Holding["assetClass"],
      country,
      currency,
      quantity: qty,
      price: px,
      nativeMarketValue: mv,
      costBasis: costBasis ? Number(costBasis) : undefined,
      valuationDate,
      valuationSource: { kind: "advisor_entered", asOf: valuationDate, confidence: "high" },
      quoteType: "advisor_entered",
      priceFreshness: "manual",
      advisorVerification: "advisor_reviewed",
      advisorNotes: advisorNotes || undefined,
      isLiability: assetClass === "liability",
      dataQuality: [],
      createdAt: todayIso(),
      updatedAt: todayIso(),
    };
    upsertHolding(h);
    setName("");
    setSymbol("");
    setQuantity("");
    setPrice("");
    setMarketValue("");
    setCostBasis("");
    setAdvisorNotes("");
    alert("Holding added.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Manually add a holding</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Asset class</Label>
              <Select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
                {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Label>Asset name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cambridge, MA Property" />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Symbol (optional)</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Country</Label>
              <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Price</Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>Market value</Label>
              <Input value={marketValue} onChange={(e) => setMarketValue(e.target.value)} />
            </div>
            <div>
              <Label>Cost basis</Label>
              <Input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} />
            </div>
          </div>
          <Label>Valuation date</Label>
          <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} />
          <Label>Advisor notes</Label>
          <Textarea rows={2} value={advisorNotes} onChange={(e) => setAdvisorNotes(e.target.value)} />
          <Button onClick={save} disabled={!accountId || !name}>Add holding</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick add account</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Label>Name</Label>
          <Input value={newAcctName} onChange={(e) => setNewAcctName(e.target.value)} placeholder="Smith Family — Trust" />
          <Label>Type</Label>
          <Select value={newAcctType} onChange={(e) => setNewAcctType(e.target.value as AccountType)}>
            {ACCOUNT_TYPE_GROUPS.flatMap((g) =>
              g.types.map((t) => (
                <option key={t} value={t}>
                  {g.label} — {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))
            )}
          </Select>
          <Label>Institution</Label>
          <Input value={newAcctInst} onChange={(e) => setNewAcctInst(e.target.value)} />
          <Label>Base currency</Label>
          <Select value={newAcctCurrency} onChange={(e) => setNewAcctCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={quickAddAccount} disabled={!newAcctName}>Add account</Button>
        </CardBody>
      </Card>
    </div>
  );
}

function ExtractionPreview({ result, fileName, sizeBytes }: { result: ExtractionResult; fileName?: string; sizeBytes?: number }) {
  const router = useRouter();
  const accounts = useAtlasStore((s) => s.accounts);
  const addImported = useAtlasStore((s) => s.addImportedToEngagement);
  const client = useAtlasStore((s) => s.client);
  // Default to new accounts: silently merging a file into whichever account
  // happens to be listed first put one client's positions in another's account.
  const [targetAccountId, setTargetAccountId] = React.useState("");
  const target = useImportTarget();
  const removeHolding = useAtlasStore((s) => s.removeHolding);
  React.useEffect(() => {
    if (target.account) setTargetAccountId(target.account.id);
  }, [target.account]);
  const [saved, setSaved] = React.useState<{ holdings: number; accounts: number; target?: string; replaced?: string } | null>(null);
  React.useEffect(() => setSaved(null), [result]);

  const totalHoldings = result.accounts.reduce((acc, a) => acc + a.holdings.length, 0);
  const sourceType = (result.extractionMethod === "papaparse"
    ? "csv"
    : result.extractionMethod === "xlsx"
    ? "excel"
    : result.extractionMethod === "heuristic"
    ? "pasted_text"
    : result.extractionMethod === "regex"
    ? "ofx_qfx"
    : result.extractionMethod.startsWith("tesseract")
    ? "image_screenshot"
    : "pdf_text") as SourceType;

  function commit() {
    if (saved) return;
    const imported = extractionToWorkspace(result, {
      fileName: fileName || result.accounts[0]?.accountName || "Imported",
      sizeBytes,
      reportingCurrency: client.baseCurrency || "USD",
      country: client.reportingCountry,
      sourceType,
      targetAccountId: targetAccountId || undefined,
    });
    if (sourceType === "image_screenshot") imported.holdings.forEach((h) => (h.quoteType = "ocr_extracted"));
    addImported(imported);
    // Positions for a balance-only account replace that single balance.
    const replaced = target.replace && targetAccountId === target.account?.id && imported.holdings.length > 0 ? target.replace : undefined;
    if (replaced) removeHolding(replaced.id);
    setSaved({
      replaced: replaced?.assetName,
      holdings: imported.holdings.length,
      accounts: imported.accounts.length,
      target: accounts.find((a) => a.id === targetAccountId)?.name,
    });
  }

  if (totalHoldings === 0) {
    return (
      <EmptyState
        title="No holdings extracted"
        description="The extractor returned no rows. Try a different format or open the Statement Workbench to refine field mappings."
      />
    );
  }

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slatey-50 border-b border-ink-100 flex items-center justify-between gap-3">
        <div className="text-[13px] text-ink-700">
          Extracted {totalHoldings} holding(s) across {result.accounts.length} account(s) · {result.extractionMethod} · {result.extractionMs}ms
        </div>
        <div className="flex items-center gap-2">
          <div>
            <Label className="mb-0!">Target account</Label>
          </div>
          <Select value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)} disabled={!!saved}>
            <option value="">
              {result.accounts.length > 1 ? `Create ${result.accounts.length} new accounts` : "Create new account"}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>Add to: {a.name}</option>
            ))}
          </Select>
          <Button onClick={commit} disabled={!!saved}>{saved ? "Saved" : "Save to proposal"}</Button>
        </div>
      </div>
      {saved && (
        <div role="status" className="px-4 py-2.5 bg-positive-50 border-b border-positive-500/30 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-800">
          <span>
            Saved {saved.holdings} holding{saved.holdings === 1 ? "" : "s"}{" "}
            {saved.target ? `to ${saved.target}` : `in ${saved.accounts} new account${saved.accounts === 1 ? "" : "s"}`}
            {saved.replaced ? ", replacing its single balance" : ""}. Values arrive as
            &ldquo;not confirmed&rdquo; until you check them.
          </span>
          <Button size="sm" onClick={() => router.push("/accounts-assets?review=1")}>Review values</Button>
        </div>
      )}
      {result.accounts.map((a) => (
        <ExtractedAccountTable key={a.id} account={a} />
      ))}
    </div>
  );
}

function ExtractedAccountTable({ account }: { account: ExtractedAccount }) {
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <div className="px-4 py-2 text-2xs uppercase tracking-widest text-ink-500 font-semibold">{account.accountName ?? "Account"}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-ink-500">
              <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
              <th className="text-left px-3 py-1.5 font-medium">Name</th>
              <th className="text-right px-3 py-1.5 font-medium">Qty</th>
              <th className="text-right px-3 py-1.5 font-medium">Price</th>
              <th className="text-right px-3 py-1.5 font-medium">Market value</th>
              <th className="text-left px-3 py-1.5 font-medium">Currency</th>
              <th className="text-left px-3 py-1.5 font-medium">Asset class</th>
              <th className="text-left px-3 py-1.5 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {account.holdings.map((h) => (
              <tr key={h.id} className="border-t border-ink-100">
                <td className="px-3 py-1.5 text-ink-900">{h.symbol ?? h.identifier?.value ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-700 max-w-[280px] truncate">{h.assetName ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink-700">{h.quantity ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink-700">{h.price ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink-900 font-medium">{h.marketValue ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-700">{h.currency ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-700">
                  {h.assetClass ? ASSET_CLASS_LABELS[h.assetClass] : h.symbol && h.quantity != null ? "Equity (assumed)" : "Unclassified"}
                </td>
                <td className="px-3 py-1.5">
                  <Badge tone={h.confidence === "high" ? "positive" : h.confidence === "low" ? "warning" : "neutral"}>{h.confidence}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// --- Upload plumbing ----------------------------------------------------------
// Every tab posts through this so failures are visible: oversized payloads are
// caught before sending (the host rejects request bodies over ~4.5 MB), and
// non-JSON error responses (like the host's 413 page) become readable messages.
const MAX_INGEST_BODY_CHARS = 4_000_000;
let reportIngestError: ((message: string | null) => void) | null = null;

async function postIngest(payload: Record<string, unknown>): Promise<ExtractionResult | null> {
  const body = JSON.stringify(payload);
  if (body.length > MAX_INGEST_BODY_CHARS) {
    reportIngestError?.(
      "That file is too large to send for processing (the limit is about 2.9 MB). For PDFs, use the PDF tab, which reads the file in your browser with no size issue. For images, export a smaller or lower-resolution copy."
    );
    return null;
  }
  reportIngestError?.(null);
  let res: Response;
  try {
    res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  } catch {
    reportIngestError?.("Couldn't reach the server. Check your connection and try again.");
    return null;
  }
  const text = await res.text();
  let data: { result?: ExtractionResult; error?: string } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || !data?.result) {
    reportIngestError?.(
      res.status === 413
        ? "That file is too large for the server to accept. For PDFs, use the PDF tab; for images, use a smaller copy."
        : data?.error ?? `Import failed (HTTP ${res.status}). Try again or use a different format.`
    );
    return null;
  }
  return data.result;
}

function IngestErrorBanner() {
  const [message, setMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    reportIngestError = setMessage;
    return () => {
      reportIngestError = null;
    };
  }, []);
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md bg-negative-50 ring-1 ring-inset ring-negative-500/30 px-4 py-3 text-[13px] text-negative-600">
      <span>{message}</span>
      <button className="text-ink-500 hover:text-ink-800 text-[12px]" onClick={() => setMessage(null)}>Dismiss</button>
    </div>
  );
}
