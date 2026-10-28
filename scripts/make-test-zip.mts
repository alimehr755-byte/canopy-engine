import JSZip from "jszip";
import fs from "fs";

const zip = new JSZip();
zip.file("essay-algebra.txt", "Algebra is the study of mathematical symbols and the rules for manipulating them. Students learn to solve equations and understand variable relationships in this fundamental course.");
zip.file("essay-history.txt", "History examines past events, societies, and civilizations. Historians analyze primary sources to construct narratives about how human cultures developed over many centuries of recorded time.");
zip.folder("sub")!.file("essay-biology.pdf.txt", "Biology explores living organisms, from cellular processes to ecosystems. Cell division, genetics, and natural selection explain the diversity of life observed in nature today.");

// one unsupported file that should be skipped, one .doc to exercise error path
zip.file("notes.csv", "a,b,c");
zip.file("legacy.doc", "old format");

const buf = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync(process.env.ZIP_OUT ?? "batch-test.zip", buf);
console.log("wrote", buf.length, "bytes");
