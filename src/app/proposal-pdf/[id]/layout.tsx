import * as React from "react";
import { PDF_BASE_CSS } from "@/pdf/styles/pdfStyles";

// The PDF preview/print routes intentionally bypass the AppShell sidebar/topbar.
// They render only the proposal document so Puppeteer (and the iframe preview)
// see exactly the print HTML.
export default function ProposalPdfLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PDF_BASE_CSS }} />
      {children}
    </>
  );
}
