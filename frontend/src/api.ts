export type UvmVersion = '1.2' | '1800.2-2020';
export type LookupResult = {
  symbol: string; type: string; version: string; file: string;
  start_line: number; end_line: number; definition: string; source: string;
  matches: Array<{ name: string; type: string; file: string; start_line: number; end_line: number }>;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export async function lookupSymbol(symbol: string, version: UvmVersion): Promise<LookupResult> {
  const response = await fetch(`${API_BASE}/api/lookup/${encodeURIComponent(symbol)}?version=${encodeURIComponent(version)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail ?? 'Lookup failed');
  return payload as LookupResult;
}

export async function getVersions() {
  const response = await fetch(`${API_BASE}/api/versions`);
  if (!response.ok) throw new Error('Cannot connect to UVM Explorer backend');
  return response.json() as Promise<Array<{ version: UvmVersion; indexed: boolean; source_available: boolean }>>;
}
