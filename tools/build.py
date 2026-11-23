"""Build data.js from your own copy of Professor Messer's SY0-701 Practice Exams PDF.
usage: python3 tools/build.py path/to/professor-messer-sy0-701-practice-exams.pdf
Needs PyMuPDF: pip3 install pymupdf"""
import os, subprocess, sys, tempfile
import fitz  # PyMuPDF

here = os.path.dirname(os.path.abspath(__file__))
pdf = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    txt, js = os.path.join(tmp, "full.txt"), os.path.join(tmp, "mcq.json")
    doc = fitz.open(pdf)
    with open(txt, "w") as f:
        f.write("\n".join(f"=====PAGE {i+1}=====\n" + p.get_text() for i, p in enumerate(doc)))
    subprocess.run([sys.executable, os.path.join(here, "parse_mcq.py"), txt, js], check=True)
    subprocess.run([sys.executable, os.path.join(here, "build_data.py"), js, os.path.join(here, "..", "data.js")], check=True)
