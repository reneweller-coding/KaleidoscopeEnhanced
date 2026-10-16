# -*- coding: utf-8 -*-
"""Declares copy constructor and copy assignment in every C++ class that does not (CGVR guidelines, template.h).

template.h declares both in every class and makes them private without an implementation where the class is not
meant to be copied; C++11 says that with `= delete`.  Classes that are copied (the compiler names them once the
deletion is in) are listed in COPYABLE and get `= default` instead, together with the move operations, which a
declared copy would otherwise suppress.

Usage:
    python Tools/cgvr_copyops.py --check     # list the classes, change nothing
    python Tools/cgvr_copyops.py             # insert the declarations
"""
import argparse
import os
import re
import sys

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_format                                          # noqa: E402

# Copied or moved by value somewhere (containers, return values): member-wise copies are what they had before.
COPYABLE = { "ExprProgram" }
# Not ours or not compiled: uic's form class, the classes of the files no build compiles.
SKIP_FILES = re.compile( r"mainwindow\.h$|FxEffect|TextureEffect", re.I )
CLASS = re.compile( r"^([ \t]*)class[ \t]+(\w+)\b([^;{]*)\{", re.M )


def classes( text ):
    """(indent, name, start of body, end of body) of every class definition in text."""
    code = cgvr_format.blank_code( text )
    out = []
    for m in CLASS.finditer( code ):
        depth = 0
        for j in range( m.end() - 1, len( code ) ):
            if code[ j ] == "{":
                depth += 1
            elif code[ j ] == "}":
                depth -= 1
                if depth == 0:
                    break
        out.append( ( m.group( 1 ), m.group( 2 ), m.end(), j ) )
    return out


def declares_copy( body, name ):
    has_ctor = re.search( r"\b%s\s*\(\s*const\s+%s\s*&" % ( name, name ), body )
    has_assign = re.search( r"operator\s*=\s*\(\s*const\s+%s\s*&" % name, body )
    return bool( has_ctor ) and bool( has_assign )


def block( indent, name, nl ):
    i = indent + "    "
    if name in COPYABLE:
        lines = [ indent + "public:",
                  i + "/// @brief Member-wise copy; instances are copied by value (CGVR template: always declared).",
                  i + "%s( const %s & ) = default;" % ( name, name ),
                  i + "/// @brief Member-wise copy assignment.",
                  i + "%s &operator=( const %s & ) = default;" % ( name, name ),
                  i + "/// @brief Member-wise move; declared because a declared copy would suppress it.",
                  i + "%s( %s && ) = default;" % ( name, name ),
                  i + "/// @brief Member-wise move assignment.",
                  i + "%s &operator=( %s && ) = default;" % ( name, name ) ]
    else:
        lines = [ indent + "private:",
                  i + "/// @brief Not copyable (CGVR template: copy constructor and assignment are always declared).",
                  i + "%s( const %s & ) = delete;" % ( name, name ),
                  i + "/// @brief Not assignable; see the copy constructor.",
                  i + "%s &operator=( const %s & ) = delete;" % ( name, name ) ]
    return nl + nl.join( lines ) + nl


def process( path, write ):
    text = cgvr_format.read( path )
    nl = "\r\n" if "\r\n" in text else "\n"
    found = []
    inserts = []
    for indent, name, start, end in classes( text ):
        body = text[ start:end ]
        if declares_copy( body, name ):
            continue
        found.append( name )
        insert_at = text.rfind( "\n", start, end ) + 1     # the start of the line holding the closing brace
        inserts.append( ( insert_at, block( indent, name, nl ) ) )
    if write and inserts:
        for pos, b in sorted( inserts, reverse=True ):
            text = text[ :pos ] + b.lstrip( "\r\n" ) + text[ pos: ]
        with open( path, "wb" ) as fh:
            fh.write( text.encode( "utf-8" ) )
    return found


MARK = "/// @brief Not copyable (CGVR template: copy constructor and assignment are always declared)."
# reset() assigns a fresh instance (`*this = ScoreCues();`): copying stays forbidden, moving into itself does not.
MOVE_ASSIGNABLE = { "ScoreCues" }


def amend( path ):
    """Adds what a declared copy takes away: the default constructor where the class declared no constructor,
    and the move assignment of MOVE_ASSIGNABLE.  Returns the class names amended."""
    text = cgvr_format.read( path )
    nl = "\r\n" if "\r\n" in text else "\n"
    done, inserts = [], []
    for indent, name, start, end in classes( text ):
        body = text[ start:end ]
        k = body.find( MARK )
        if k < 0:
            continue
        own = cgvr_format.blank_code( body[ :k ] )
        i = indent + "    "
        add = []
        if not re.search( r"(?<![~\w])%s\s*\(" % name, own ):
            add += [ indent + "public:",
                     i + "/// @brief Default construction, which the declared copy operations would otherwise suppress.",
                     i + "%s() = default;" % name ]
        if name in MOVE_ASSIGNABLE and "operator=( %s && )" % name not in body:
            add += [ indent + "private:",
                     i + "/// @brief Move assignment: reset() assigns a fresh instance.",
                     i + "%s &operator=( %s && ) = default;" % ( name, name ) ]
        if add:
            pos = start + body.rfind( "\n", 0, k ) + 1
            pos = text.rfind( "\n", start, pos - 1 ) + 1         # the line of the "private:" before the mark
            inserts.append( ( pos, nl.join( add ) + nl ) )
            done.append( name )
    for pos, b in sorted( inserts, reverse=True ):
        text = text[ :pos ] + b + text[ pos: ]
    if inserts:
        with open( path, "wb" ) as fh:
            fh.write( text.encode( "utf-8" ) )
    return done


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--check", action="store_true" )
    ap.add_argument( "--amend", action="store_true", help="add default constructors / move assignments only" )
    a = ap.parse_args()
    if a.amend:
        for f in cgvr_format.all_files():
            if f.lower().endswith( cgvr_format.CPP_EXT ) and not SKIP_FILES.search( f ):
                d = amend( f )
                if d:
                    print( "%-40s %s" % ( os.path.relpath( f, cgvr_format.ROOT ), " ".join( d ) ) )
        return 0
    total = 0
    for f in cgvr_format.all_files():
        if not f.lower().endswith( cgvr_format.CPP_EXT ) or SKIP_FILES.search( f ):
            continue
        found = process( f, not a.check )
        if found:
            total += len( found )
            print( "%-40s %s" % ( os.path.relpath( f, cgvr_format.ROOT ), " ".join( found ) ) )
    print( "%s %d classes" % ( "would declare copy operations in" if a.check else "declared copy operations in", total ) )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
