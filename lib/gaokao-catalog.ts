import catalog from '../data/gaokao/catalog.json';
export const gaokaoCatalog = catalog;
export const gaokaoPaper = (key:string) => catalog.papers.find(p=>p.key===key);
export async function digest(bytes:ArrayBuffer | Uint8Array | string) {
 const data=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data as BufferSource))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
