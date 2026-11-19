export function extractClaimCode(raw: string): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  if (/^(sehhati:|https?:)/i.test(value)) {
    try {
      const url = new URL(value);
      value =
        url.searchParams.get('c') ??
        url.searchParams.get('code') ??
        url.pathname.split('/').filter(Boolean).pop() ??
        '';
    } catch {
      const match = value.match(/[?&](?:c|code)=([^&]+)/i);
      value = match ? decodeURIComponent(match[1]) : '';
    }
  }

  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.length === 8 ? clean : null;
}

export function formatScanCode(raw: string) {
  const code = extractClaimCode(raw);
  if (!code) return null;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
