// #116: the Stratovell desktop application's public availability. The website's
// download page reads only this record. A download link appears only when an
// approved, published installer is recorded here, through a reviewed change;
// until then the page states that no public download exists yet.

export interface ApprovedDesktopRelease {
  version: string;
  /** The published installer's address. */
  url: string;
  sha256: string;
  sizeBytes: number;
  /** "signed" once code signing exists; an unsigned build is never published here. */
  signing: "signed";
  /** Windows versions this release was actually tested on. */
  testedOn: string[];
}

/** No approved public installer yet: private UAT builds are never listed here. */
export const DESKTOP_RELEASE: ApprovedDesktopRelease | null = null;

export const DESKTOP_AVAILABILITY_NOTE =
  "Stratovell for Windows is in private testing. There's no public download yet; this page will link to the installer once a signed release is approved.";
