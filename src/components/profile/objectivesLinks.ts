// #111: the client's objectives (the discovery questionnaire, the advisor's
// review and the brief) moved from Client Profile to their own page. Links
// saved before the move pointed at anchors on Client Profile; they still land
// on the same section.

export const OBJECTIVES_PATH = "/client-objectives";

const MOVED_ANCHOR = /^#(client-discovery|client-brief|dq-[\w-]+|brief-[\w-]+)$/;

/** Where an old Client Profile discovery anchor now lives, or null when the hash isn't one. */
export function movedDiscoveryLink(hash: string): string | null {
  return MOVED_ANCHOR.test(hash) ? `${OBJECTIVES_PATH}${hash}` : null;
}
