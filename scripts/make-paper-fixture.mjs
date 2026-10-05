import { mkdirSync, writeFileSync } from "node:fs";
// Deterministic, two-column, two-page PDF for browser integration tests.
const objects = [], add = text => { objects.push(text); return objects.length; };
add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>");
add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const stream1 = "BT /F1 12 Tf 40 750 Td (Senior Math - synthetic test paper) Tj ET\nBT /F1 12 Tf 40 680 Td (1. Let f\\(x\\)=x^2. Find its derivative.) Tj ET\nBT /F1 12 Tf 40 430 Td (2. Solve 2x + 4 = 10.) Tj ET\nBT /F1 12 Tf 320 680 Td (3. A circle has radius 3. Find its area.) Tj ET\nBT /F1 12 Tf 320 220 Td (4. Let a_n = n. Find a_1 and a_2.) Tj ET\nBT /F1 12 Tf 320 180 Td (Continued on next page.) Tj ET";
add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>"); add(`<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}\nendstream`);
const stream2 = "BT /F1 12 Tf 40 680 Td (Also find a_3 and a_4.) Tj ET\nBT /F1 12 Tf 40 430 Td (5. Find the maximum of -x^2 + 4x.) Tj ET";
add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>"); add(`<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}\nendstream`);
let pdf = "%PDF-1.4\n", offsets = [0];
for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
mkdirSync("work/paper-fixtures", { recursive: true }); writeFileSync("work/paper-fixtures/two-column.pdf", pdf);
console.log("Created work/paper-fixtures/two-column.pdf");
