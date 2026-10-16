# -*- coding: utf-8 -*-
"""Lays the comments of classes, structs, enums, types, macros and variables out after the CGVR comment template.

    /** @class Mesh::Triangle          a class (template.cpp, template-comments.cpp)
     *
     * One line.
     *
     * The detailed description ...
     *
     * @see
     *   ...
     **/

    /** One line.                      a struct, enum, typedef, define or variable
     *
     * The detailed description ...
     **/

    /** One line. */                   ... when one line is all there is

Function comments are Tools/cgvr_comments.py's.  Blocks that hold Doxygen structure commands (@var, @name, @{ ...)
and member groups stay as they are; trailing `///<` comments stay too.

Usage:
    python Tools/cgvr_typecomments.py              # report what would change
    python Tools/cgvr_typecomments.py --apply
"""
import argparse
import os
import re
import subprocess
import sys

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_comments as C                                   # noqa: E402
import cgvr_format                                          # noqa: E402

ROOT = os.path.dirname( os.path.dirname( os.path.abspath( __file__ ) ) )
SKIP = { "Source/mainwindow.h" }
STRUCTURE = re.compile( r"[@\\](var|name|\{|\}|defgroup|addtogroup|ingroup|fn|def|typedef|enum|struct|union|class|"
                        r"namespace|file|page|mainpage|cond|endcond|copydoc)\b" )
ANON = "<anonymous>"
TYPE_DECL = re.compile( r"^\s*(template\s*<.*>\s*)?(class|struct|union)\s+(\w+)\b[^;]*$" )


def scopes( lines ):
    """For each line index, the names of the classes/structs/namespaces that enclose it."""
    code = cgvr_format.blank_code( "\n".join( lines ) ).split( "\n" )
    stack = []          # (name or None, brace depth at which it opened)
    pending = None
    depth = 0
    out = []
    for i, l in enumerate( code ):
        out.append( [ n for n, _ in stack if n ] )
        m = TYPE_DECL.match( l ) or re.match( r"^\s*namespace\s+(\w+)?\s*$", l )
        if m and not l.strip().startswith( "friend" ):
            pending = m.group( 3 ) if m.re is TYPE_DECL else ( m.group( 1 ) or ANON )
        for c in l:
            if c == "{":
                depth += 1
                stack.append( ( pending, depth ) )
                pending = None
            elif c == "}":
                if stack and stack[ -1 ][ 1 ] == depth:
                    stack.pop()
                depth -= 1
            elif c == ";":
                pending = None
    return out


def find_blocks( lines ):
    """[(first, last, style)] of every doc comment block above a declaration."""
    out, i = [], 0
    while i < len( lines ):
        s = lines[ i ].strip()
        if s.startswith( ( "/**", "/*!" ) ) and not s.startswith( "/***" ):
            j = i
            while "*/" not in lines[ j ][ ( lines[ j ].find( "/*" ) + 2 ) if j == i else 0: ]:
                j += 1
            if not lines[ i ].lstrip().startswith( ( "/**<", "/*!<" ) ):
                out.append( ( i, j, "block" ) )
            i = j + 1
        elif s.startswith( ( "///", "//!" ) ) and not s.startswith( ( "///<", "//!<" ) ):
            j = i
            while j + 1 < len( lines ) and lines[ j + 1 ].strip().startswith( ( "///", "//!" ) ) \
                    and not lines[ j + 1 ].strip().startswith( ( "///<", "//!<" ) ):
                j += 1
            out.append( ( i, j, "slash" ) )
            i = j + 1
        else:
            i += 1
    return out


def next_code( lines, j ):
    k = j + 1
    while k < len( lines ) and ( not lines[ k ].strip() or re.match( r"^\s*(template\s*<.*>|\[\[[^\]]*\]\]|Q_INVOKABLE)\s*$", lines[ k ] ) ):
        k += 1
    return k


def kind_of( line ):
    """'class', 'other' (struct, enum, type, macro, variable) or 'function' for the declaration on this line."""
    s = line.strip()
    if TYPE_DECL.match( line ) and re.match( r"^(template\s*<.*>\s*)?class\b", s ):
        return "class"
    if re.match( r"^(template\s*<.*>\s*)?(struct|union|enum|typedef|using|namespace|#\s*define)\b", s ):
        return "other"
    code = re.sub( r"//.*$", "", s )
    if "(" in code.split( "=" )[ 0 ] and not re.match( r"^(static\s+|const\s+|constexpr\s+|inline\s+)*[\w:<>,\s*&]+\s+\**\w+\s*\[", code ):
        # a call or a function declaration; a variable initialised with a call has its "(" after the "="
        return "function"
    return "other"


def render( model, indent, cls ):
    p = indent + " * "
    if cls is None and not ( model[ "details" ] or model[ "other" ] ):
        one = indent + "/** " + model[ "brief" ] + " */"
        if len( one ) <= C.WIDTH + 4:
            return [ one ]
    out = []
    if cls:
        out += [ indent + "/** @class " + cls, p.rstrip() ]
        out += [ p + l for l in C.wrap( model[ "brief" ], "", p ) ]
    else:
        bl = C.wrap( model[ "brief" ], "", p )
        out.append( indent + "/** " + bl[ 0 ] )
        out += [ p + l for l in bl[ 1: ] ]
    if model[ "details" ]:
        out.append( p.rstrip() )
        out += [ ( p + l ).rstrip() for l in model[ "details" ] ]
    others = sorted( model[ "other" ], key=lambda o: C.ORDER_AFTER.index( o[ 0 ] ) if o[ 0 ] in C.ORDER_AFTER else len( C.ORDER_AFTER ) )
    for tag, t in others:
        out.append( p.rstrip() )
        out.append( p + "@" + tag )
        out += [ p + "  " + l for l in C.wrap( t, "", p + "  " ) ]
    out.append( indent + " **/" )
    return out


def done( lines, first, last ):
    """True if the block already has the template's layout."""
    s = lines[ first ].strip()
    if s.startswith( ( "/**  ", "/** @class", "/*! @file" ) ):
        return True
    if first == last and re.match( r"^/\*\* [^@\s].*\*/$", s ) and not re.search( r"[@\\]brief\b", s ):
        return True
    return last > first and lines[ last ].strip() == "**/" and not re.search( r"[@\\]brief\b", "\n".join( lines[ first:last + 1 ] ) )


def process( rel, apply, report ):
    path = os.path.join( ROOT, rel )
    raw = cgvr_format.read( path )
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.replace( "\r\n", "\n" ).split( "\n" )
    sc = scopes( lines )
    edits = []
    for first, last, style in find_blocks( lines ):
        text = "\n".join( lines[ first:last + 1 ] )
        if done( lines, first, last ) or STRUCTURE.search( text ):
            continue
        k = next_code( lines, last )
        if k >= len( lines ) or lines[ k ].lstrip().startswith( ( "//", "/*" ) ):
            continue
        kind = kind_of( lines[ k ] )
        if kind == "function":
            report.append( "%s:%d  above a function, left to cgvr_comments.py: %s" % ( rel, first + 1, lines[ k ].strip()[ :60 ] ) )
            continue
        model = C.parse( C.strip_markers( lines[ first:last + 1 ] ) )
        if not model[ "brief" ]:
            report.append( "%s:%d  no one-line description" % ( rel, first + 1 ) )
            continue
        if model[ "params" ] or model[ "return" ] or model[ "tparams" ] or model[ "retvals" ]:
            # a macro "function" or a callback type: the function layout keeps its parameters
            model[ "params" ] = [ [ n, d ] for n, d in model[ "params" ] ]
            cls = None
            new = C.render( model, re.match( r"^\s*", lines[ first ] ).group( 0 ) )
        else:
            cls = None
            if kind == "class":
                name = TYPE_DECL.match( lines[ k ] ).group( 3 )
                # Doxygen names a class in an anonymous namespace after the file; such a class keeps a plain block
                cls = None if ANON in sc[ k ] else "::".join( [ n for n in sc[ k ] if n ] + [ name ] )
            new = render( model, re.match( r"^\s*", lines[ first ] ).group( 0 ), cls )
        if new != lines[ first:last + 1 ]:
            edits.append( ( first, last, new ) )
    for first, last, new in reversed( edits ):
        lines[ first:last + 1 ] = new
    if apply and edits:
        with open( path, "wb" ) as fh:
            fh.write( nl.join( lines ).encode( "utf-8" ) )
    return len( edits )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--apply", action="store_true" )
    a = ap.parse_args()
    files = subprocess.run( [ "git", "ls-files", "Source/*.h", "Source/*.cpp", "PresetEditor/*.h", "PresetEditor/*.cpp",
                              "SetupTool/*.h", "SetupTool/*.cpp" ], cwd=ROOT, capture_output=True, text=True ).stdout.split()
    report, total, nfiles = [], 0, 0
    for rel in files:
        if rel in SKIP:
            continue
        n = process( rel, a.apply, report )
        total += n
        nfiles += n > 0
    for r in report:
        print( r )
    print( "blocks rewritten: %d in %d files" % ( total, nfiles ) )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
