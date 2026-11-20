// #59 / #109: identity is removed from everything Stratovell AI sends to a
// model. One function, used by the agent loop (every tool result and the
// question) and by the page that shows the advisor what would be sent.

export interface RedactionSource {
  client: { fullName?: string; householdName?: string };
  advisor: { name?: string; email?: string };
  sourceDocuments?: { fileName: string }[];
}

/**
 * Replaces the client's and household's names, the advisor's name and email,
 * and import file names (which often carry a client's name) wherever they
 * appear. With `json`, names are matched in their JSON-escaped form.
 */
export function redactIdentity(s: RedactionSource, text: string, json = false): string {
  const pairs: [string | undefined, string][] = [
    [s.client.householdName, "[client household]"],
    [s.client.fullName, "[client]"],
    [s.advisor.email, "[advisor email]"],
    [s.advisor.name, "[advisor]"],
    ...(s.sourceDocuments ?? []).map((d, i) => [d.fileName, `[import ${i + 1}]`] as [string, string]),
  ];
  let out = text;
  for (const [raw, label] of pairs.filter(([r]) => typeof r === "string" && r.trim().length >= 3).sort((a, b) => b[0]!.length - a[0]!.length)) {
    const needle = json ? JSON.stringify(raw).slice(1, -1) : raw!;
    out = out.split(needle).join(label);
  }
  return out;
}
