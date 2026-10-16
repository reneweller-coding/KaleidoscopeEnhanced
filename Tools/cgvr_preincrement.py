# -*- coding: utf-8 -*-
"""Pre-increment instead of post-increment where the value is not used (CGVR guidelines: ++i, not i++).

Only two forms are touched, both of which discard the expression's value, so ++x and x++ mean the same there:
the increment clause of a for statement (`for ( ...; ...; i++ )`) and a statement of its own (`count++;`,
`m_hits[k]--;`, `p->n++;`).  The operand is an identifier with member, pointer-member and index accesses;
anything else (`*p++`, calls) is left as it is.  Comments and string literals are not touched.

Usage:
    python Tools/cgvr_preincrement.py --check     # count, change nothing
    python Tools/cgvr_preincrement.py             # rewrite the C++ sources and the shaders
"""
import argparse
import os
import re
import sys

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_format                                          # noqa: E402

OPERAND = r"[A-Za-z_]\w*(?:(?:\.|->)[A-Za-z_]\w*|\[[^\[\]\n;]*\])*"
FOR_INC = re.compile( r"(;\s*)(" + OPERAND + r")\s*(\+\+|--)(\s*\))" )
STATEMENT = re.compile( r"(^|[;{}]|\belse\b|\bdo\b|\)\s*\n)(\s*)(" + OPERAND + r")\s*(\+\+|--)(\s*;)", re.M )


def rewrite( text ):
    """Returns (new text, number of rewrites); comments and strings are left as they were."""
    code = cgvr_format.blank_code( text )
    edits = {}                                       # start -> (end, replacement)
    for m in FOR_INC.finditer( code ):
        if re.search( r"\bfor\s*\([^()]*(\([^()]*\)[^()]*)*$", code[ max( 0, m.start() - 400 ):m.start() + 1 ] ):
            edits[ m.start( 2 ) ] = ( m.end( 3 ), m.group( 3 ) + text[ m.start( 2 ):m.end( 2 ) ] )
    for m in STATEMENT.finditer( code ):
        if re.match( r"(return|case|delete|goto|throw)$", m.group( 3 ) ):
            continue
        edits[ m.start( 3 ) ] = ( m.end( 4 ), m.group( 4 ) + text[ m.start( 3 ):m.end( 3 ) ] )
    out = text
    for start in sorted( edits, reverse=True ):
        end, replacement = edits[ start ]
        out = out[ :start ] + replacement + out[ end: ]
    return out, len( edits )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--check", action="store_true" )
    a = ap.parse_args()
    total, files = 0, 0
    for f in cgvr_format.all_files():
        text = cgvr_format.read( f )
        new, n = rewrite( text )
        if n:
            files += 1
            total += n
            if not a.check:
                with open( f, "wb" ) as fh:
                    fh.write( new.encode( "utf-8" ) )
    print( "%s %d post-increments in %d files" % ( "would rewrite" if a.check else "rewrote", total, files ) )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
