function sortObjectKeys(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce((result: Record<string, any>, key) => {
      result[key] = sortObjectKeys(obj[key]);
      return result;
    }, {});
}

export async function generateActionHash(
  agentId: string,
  targetUrl: string,
  toolArgs: Record<string, any>
): Promise<string> {
  const normalizedString = JSON.stringify({
    agentId,
    targetUrl,
    args: sortObjectKeys(toolArgs),
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}