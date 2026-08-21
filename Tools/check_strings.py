#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Verify Strings.cpp's tables against the StrId enum.

    python Tools/check_strings.py

The tables in Strings.cpp are indexed DIRECTLY by the enum -- there is no key
lookup -- so a single entry in the wrong position silently shifts every label
after it onto the wrong widget. `const char *kDE[S_COUNT]` catches a wrong
COUNT at compile time, but nothing catches a wrong ORDER.

That is not hypothetical. Four hint strings were once appended at the end of
the tables while the enum interleaved them, and the Setup window shipped with
its recording-frame-rate combo labelled "Debug: show hidden presets" and its
motion-blur checkbox carrying the hidden-presets explanation. Everything
compiled, both tables had the same length, and the mistake was invisible until
somebody looked at the window.

Checks performed:
  * every table has exactly the enum's entries, in the enum's order
  * no duplicate ids within a table
  * no \\uXXXX escapes -- MSVC narrows those to the ANSI execution charset
    (u+00fc becomes the single byte 0xFC), which is not valid UTF-8 and reaches
    the UI as a replacement character. Write the character itself: the source
    is UTF-8 and raw characters pass through intact.

Exit code is 1 on any finding, so this can gate a commit.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HDR = os.path.join(ROOT, "Source", "Strings.h")
SRC = os.path.join(ROOT, "Source", "Strings.cpp")

ENTRY = re.compile(r"^\t/\* (S_[A-Z0-9_]+) \*/")
TABLE = re.compile(r"^const char \*k([A-Z]+)\[S_COUNT\] = \{")


def enum_order():
    text = io.open(HDR, encoding="utf-8").read()
    body = text[text.index("enum StrId"):text.index("S_COUNT")]
    out = []
    for m in re.finditer(r"\bS_[A-Z0-9_]+\b", body):
        if m.group(0) not in out:
            out.append(m.group(0))
    return out


def tables():
    out, name, cur = {}, None, None
    for line in io.open(SRC, encoding="utf-8"):
        m = TABLE.match(line)
        if m:
            name, cur = m.group(1), []
            out[name] = cur
            continue
        if cur is not None:
            if line.startswith("};"):
                cur = None
                continue
            e = ENTRY.match(line)
            if e:
                cur.append(e.group(1))
    return out


def main():
    order = enum_order()
    tabs = tables()
    problems = []

    if not tabs:
        print("no tables found in %s" % SRC)
        return 2

    for name, ids in sorted(tabs.items()):
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            problems.append("k%s: duplicate ids: %s" % (name, ", ".join(dupes)))

        missing = [i for i in order if i not in ids]
        extra = [i for i in ids if i not in order]
        if missing:
            problems.append("k%s: missing %d id(s): %s"
                            % (name, len(missing), ", ".join(missing[:6])))
        if extra:
            problems.append("k%s: %d id(s) not in the enum: %s"
                            % (name, len(extra), ", ".join(extra[:6])))
        if missing or extra:
            continue

        for pos, (want, got) in enumerate(zip(order, ids)):
            if want != got:
                problems.append(
                    "k%s: order diverges at index %d -- enum says %s, table has "
                    "%s.\n        Every entry from here on lands on the wrong "
                    "widget." % (name, pos, want, got))
                break

    escapes = []
    for n, line in enumerate(io.open(SRC, encoding="utf-8"), 1):
        if re.search(r"\\u[0-9a-fA-F]{4}", line):
            escapes.append(n)
    if escapes:
        problems.append(
            "\\uXXXX escape(s) on line(s) %s -- MSVC narrows these to the ANSI "
            "execution charset\n        and they reach the UI as replacement "
            "characters. Write the character itself."
            % ", ".join(str(x) for x in escapes[:8]))

    if problems:
        print("Strings tables: %d problem(s)\n" % len(problems))
        for p in problems:
            print("  * %s" % p)
        return 1

    print("Strings tables OK: %d ids, %d table(s) (%s), all in enum order"
          % (len(order), len(tabs), ", ".join("k" + t for t in sorted(tabs))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
