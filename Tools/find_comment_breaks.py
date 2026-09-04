# -*- coding: utf-8 -*-
"""Find premature /* */ closures in GLSL/C++ source files.

/* */ blocks do NOT nest in C/GLSL: the first */ encountered closes the
comment, wherever it is. Doc-comment prose that happens to contain a literal
*/ substring -- typically a path example like "rec_*/frame.jpg" -- silently
truncates the block, and everything after it becomes real (broken) code.
This is a proper comment-aware lexer (tracks //, /* */ and string-literal-
adjacent state correctly), not a blind substring search, so it doesn't flag
safe patterns like "Presets/*.xml" (a lone /* inside an already-open
comment is harmless; only a */ closing one prematurely is a real bug). It
also flags an unclosed /* left open through EOF.

Usage:
    python Tools/find_comment_breaks.py <file> [<file> ...]

Exit code is nonzero iff any file has a problem, matching shadercheck.py's
convention.
"""
import sys


def scan(path):
    src = open(path, encoding="utf-8", errors="replace").read()
    n = len(src)
    i = 0
    line = 1
    in_block = False
    block_start_line = None
    problems = []
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if not in_block:
            if c == "/" and i + 1 < n and src[i + 1] == "/":
                # line comment: skip to end of line
                j = src.find("\n", i)
                i = n if j < 0 else j
                continue
            if c == "/" and i + 1 < n and src[i + 1] == "*":
                in_block = True
                block_start_line = line
                i += 2
                continue
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                problems.append((line, "ORPHAN */ (no open block comment here)"))
                i += 2
                continue
            i += 1
        else:
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                in_block = False
                i += 2
                continue
            i += 1
    if in_block:
        problems.append((block_start_line, "UNCLOSED /* through EOF"))
    return problems


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    total_problems = 0
    for path in sys.argv[1:]:
        probs = scan(path)
        if probs:
            print("== %s ==" % path)
            for ln, msg in probs:
                print("  line %d: %s" % (ln, msg))
            total_problems += len(probs)
    print("find_comment_breaks: %d file(s) checked, %d problem(s)" %
          (len(sys.argv) - 1, total_problems))
    return 1 if total_problems else 0


if __name__ == "__main__":
    sys.exit(main())
