# -*- coding: utf-8 -*-
"""Prints docs/Catalog/Katalog.html to Katalog.pdf in parts and joins them with Ghostscript.

Chrome (portable, headless) dies with exit code 0xE0000008 (out of memory) on the whole page of 2475 scenes; five parts of
about 540 entries print in 5 s each (1002 pages, 73 MB).  Run after Tools/make_catalog.py, on a quiet machine:

    python Tools/print_catalog_pdf.py [parts] [out.pdf]       (default: 5 parts, docs/Catalog/Katalog.pdf)

The part files are written next to Katalog.html (the images are relative to it) and removed again.  Needs the portable
Chrome (G:\\Tools\\GoogleChromePortable) and Ghostscript (C:\\Program Files\\gs); the browser takes its own --user-data-dir,
without one it hangs.
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = os.path.join(ROOT, "docs", "Catalog")
CHROME = r"G:\Tools\GoogleChromePortable\App\Chrome-bin\chrome.exe"
GS = r"C:\Program Files\gs\gs10.00.0\bin\gswin64c.exe"


def main():
    """Splits the catalogue at its entries, prints every part and joins the PDFs.

    @return
      The process exit code.
    """
    parts = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(CAT, "Katalog.pdf")
    work = tempfile.mkdtemp(prefix="kaleido-catalog-pdf-")
    html = io.open(os.path.join(CAT, "Katalog.html"), encoding="utf-8").read()
    head_end = html.index("<body>") + len("<body>")
    head, body = html[:head_end], html[head_end:]
    body = body[:body.rindex("</body>")]
    cuts = [m.start() for m in re.finditer(r"<h2>", body)]
    per = len(cuts) // parts + 1
    bounds = [0] + [cuts[min(i * per, len(cuts) - 1)] for i in range(1, parts)] + [len(body)]
    files, pdfs = [], []
    try:
        for i in range(parts):
            name = os.path.join(CAT, "_part%d.html" % (i + 1))
            io.open(name, "w", encoding="utf-8").write(head + body[bounds[i]:bounds[i + 1]] + "</body></html>")
            files.append(name)
            pdf = os.path.join(work, "part%d.pdf" % (i + 1))
            cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--user-data-dir=" + os.path.join(work, "profile%d" % i),
                   "--print-to-pdf=" + pdf, "file:///" + name.replace("\\", "/").replace(" ", "%20")]
            t = time.time()
            r = subprocess.run(cmd, timeout=900, capture_output=True)
            for _ in range(120):
                if os.path.isfile(pdf):
                    break
                time.sleep(0.5)
            if not os.path.isfile(pdf):
                print("part %d: no PDF (browser exit code %d)" % (i + 1, r.returncode))
                return 1
            time.sleep(2)
            print("part %d: %d entries, %.0f s, %d KB" % (i + 1, body[bounds[i]:bounds[i + 1]].count("<h2>"), time.time() - t, os.path.getsize(pdf) // 1024))
            pdfs.append(pdf)
        if os.path.exists(out):
            os.remove(out)
        r = subprocess.run([GS, "-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-dAutoFilterColorImages=false", "-dColorImageFilter=/DCTEncode",
                            "-dPassThroughJPEGImages=true", "-dCompatibilityLevel=1.6", "-sOutputFile=" + out] + pdfs, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.isfile(out):
            print("Ghostscript failed:", (r.stderr or "")[-300:])
            return 1
        print("%s: %d MB" % (out, os.path.getsize(out) // (1024 * 1024)))
        return 0
    finally:
        for f in files:
            if os.path.exists(f):
                os.remove(f)
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
