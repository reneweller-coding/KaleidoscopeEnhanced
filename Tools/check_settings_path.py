# -*- coding: utf-8 -*-
"""check_settings_path.py -- the main program names its settings file in one place only.

Source/SettingsFile.h is the single access point (SettingsFile::path(), which honours KALEIDO_SETTINGS).  Until
16.10.2026 the path was written out at fifteen places in three spellings, so a test run could not be pointed at a
copy of its own.  This script fails on any other spot in Source/ that spells the path "..\\kaleidoscope_settings.ini"
as a string literal (text that only mentions the file name, like the usage message, is fine).

    python Tools/check_settings_path.py      # exit code 0 = one access point, 1 = another one crept in
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The literal as C++ source spells it: "..\\kaleidoscope_settings.ini" (two backslash characters in the file).
LITERAL = re.compile(r'"\.\.(?:\\\\|/)kaleidoscope_settings\.ini"')
ALLOWED = {"SettingsFile.h"}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    hits = []
    for p in sorted(glob.glob(os.path.join(ROOT, "Source", "*.cpp")) + glob.glob(os.path.join(ROOT, "Source", "*.h"))):
        if os.path.basename(p) in ALLOWED:
            continue
        for n, line in enumerate(io.open(p, encoding="utf-8", errors="replace"), 1):
            if LITERAL.search(line):
                hits.append("%s:%d: %s" % (os.path.relpath(p, ROOT), n, line.strip()))
    for h in hits:
        print("  " + h)
    print("settings path: %s" % ("one access point (SettingsFile::path())" if not hits else
                                 "%d other spot(s) -- use SettingsFile::path()" % len(hits)))
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
