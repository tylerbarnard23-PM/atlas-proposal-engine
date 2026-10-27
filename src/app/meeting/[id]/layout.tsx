import * as React from "react";
import { PDF_BASE_CSS } from "@/pdf/styles/pdfStyles";

// D3: the meeting view bypasses the AppShell like the PDF preview, so the
// approved version is shown with exactly the document's styles.
export default function MeetingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PDF_BASE_CSS }} />
      {children}
    </>
  );
}
