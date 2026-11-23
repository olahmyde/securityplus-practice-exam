"""Build data.js from your own copy of Professor Messer's SY0-701 Practice Exams PDF.
usage: python3 tools/build.py path/to/professor-messer-sy0-701-practice-exams.pdf
Needs PyMuPDF: pip3 install pymupdf"""
import os, subprocess, sys, tempfile
import fitz  # PyMuPDF

def page_text(page):
    """Page text in visual order (top to bottom, then left to right).
    Exhibits (logs, tables, commands) are set in a monospace font and sit between the
    question and its options, but PyMuPDF's default order puts them at the end of the page.
    Monospace rows are prefixed with a backtick so the parser renders them as a log block."""
    rows = []  # [y, x, text, mono]
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            text = "".join(s["text"] for s in l["spans"])
            if not text.strip():
                continue
            mono = all("courier" in s["font"].lower() or "mono" in s["font"].lower() for s in l["spans"] if s["text"].strip())
            rows.append([l["bbox"][1], l["bbox"][0], text, mono])
    rows.sort(key=lambda r: (round(r[0]), r[1]))
    out = []
    for y, x, text, mono in rows:
        prev = out[-1] if out else None
        if prev and mono and prev[2] and abs(prev[0] - y) < 2.5:  # same row of a monospace table
            prev[1] += ("   " if mono else " ") + text.strip()
        else:
            out.append([y, text.rstrip(), mono])
    return "\n".join(("`" + t.strip()) if mono else t for _, t, mono in out)


here = os.path.dirname(os.path.abspath(__file__))
pdf = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    txt, js = os.path.join(tmp, "full.txt"), os.path.join(tmp, "mcq.json")
    doc = fitz.open(pdf)
    with open(txt, "w") as f:
        f.write("\n".join(f"=====PAGE {i+1}=====\n" + page_text(p) for i, p in enumerate(doc)))
    subprocess.run([sys.executable, os.path.join(here, "parse_mcq.py"), txt, js], check=True)
    subprocess.run([sys.executable, os.path.join(here, "build_data.py"), js, os.path.join(here, "..", "data.js")], check=True)
