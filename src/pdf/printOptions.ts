// How the proposal HTML is printed to PDF. One definition, used by the
// final/draft PDF route and by the real-renderer regression test
// (tests/pdfPageNotice.test.ts), so the test prints exactly what users get.
//
// Zero margins here leave the page margins to the document's own CSS `@page`
// rules (pdfStyles.ts), which also apply when the meeting view is printed.

export const PDF_PRINT_OPTIONS = {
  format: "Letter",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
  preferCSSPageSize: false,
} as const;
