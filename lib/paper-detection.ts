import type { QuestionAnchor } from './paper';

export type DetectionTile = { index: number; top: number; width: number; height: number };
export type DetectionRow = { id: number; x: number; top: number; bottom: number };
/** Give the model real image rows to select, instead of asking it to estimate coordinates. */
export function detectionRows(pixels: Uint8ClampedArray,width:number,height:number): DetectionRow[] {
 const rows:DetectionRow[]=[];
 for(let y=0;y<height;y++) {
  let ink=0,left=width;
  for(let x=Math.floor(width*.04);x<width*.96;x+=2){const i=(y*width+x)*4;if(pixels[i+3]>128&&pixels[i]+pixels[i+1]+pixels[i+2]<540){ink++;left=Math.min(left,x);}}
  if(ink<3)continue;
  const previous=rows.at(-1);
  if(previous&&y-previous.bottom<=Math.max(4,Math.ceil(height*.004))){previous.bottom=y;previous.x=Math.min(previous.x,left);}
  else rows.push({id:rows.length,x:left,top:y,bottom:y});
 }
 return rows.filter(r=>r.bottom-r.top>=3);
}
export function detectionTiles(width: number, height: number): DetectionTile[] {
 const step = Math.ceil(height / 4), overlap = Math.ceil(height * .035);
 return Array.from({ length: 4 }, (_, index) => {
  const top = Math.max(0, index * step - overlap);
  return { index, top, width, height: Math.min(height, (index + 1) * step + overlap) - top };
 });
}
/** Merge overlap detections only when both the number and location agree. */
export function mergeDetectedAnchors(anchors: QuestionAnchor[]): QuestionAnchor[] {
 const result: QuestionAnchor[] = [];
 for (const anchor of [...anchors].sort((a,b) => a.page-b.page || a.y-b.y || a.x-b.x)) {
  const previous = result.find(a => a.page === anchor.page && a.number === anchor.number && Math.abs(a.x-anchor.x)<.03 && Math.abs(a.y-anchor.y)<.035);
  if (!previous) result.push(anchor);
 }
 const numbers = new Set<number>();
 for (const anchor of result) {
  if (numbers.has(anchor.number)) throw Error(`第 ${anchor.number} 题出现不同位置，无法可靠切题，请核对或手动框选。`);
  numbers.add(anchor.number);
 }
 return result;
}
