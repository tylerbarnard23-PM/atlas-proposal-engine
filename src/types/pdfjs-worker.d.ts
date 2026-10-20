// pdf.js ships no types for its worker entry; it's imported only for its side
// effect of registering globalThis.pdfjsWorker (see ingestion/pdf/readPdfNode).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
