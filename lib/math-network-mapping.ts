import crosswalk from '@/data/math-network/project-crosswalk.json';
export type NetworkMapping = (typeof crosswalk.mappings)[number];
const byId = new Map(crosswalk.mappings.map(row => [row.sourceId, row]));
/** Explicit same-name or curated category links only; never substring-match private questions. */
export function projectNetworkMapping(id: string): NetworkMapping | undefined { return byId.get(id); }
export function normalizeNetworkLabel(label: string) { return label.normalize('NFKC').replace(/[\s·、，,（）()]/g, '').replaceAll('图象', '图像'); }
