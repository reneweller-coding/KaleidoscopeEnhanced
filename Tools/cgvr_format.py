# -*- coding: utf-8 -*-
"""Formats the C++ sources and GLSL shaders after the CGVR programming guidelines and proves it changed layout only.

Pass 1 runs clang-format with the repository's .clang-format (ColumnLimit 0: indentation, braces, spaces,
alignment; every existing line break is kept).  Pass 2 runs clang-format with Tools/clang-format-wrap120.yaml on
the lines that are still longer than 120 characters and nothing else -- the user's choice of 16.10.2026: wrap
only the long lines, leave the rest as written.

Every formatted text is checked against the original before it is written: the token sequence without comments
and whitespace (preprocessor lines as whole units, function-like #define kept apart from object-like) and the
words of all comments must be identical.  A file that fails the check is not written and is reported.

Usage:
    python Tools/cgvr_format.py                  # format all C++ and GLSL files in place
    python Tools/cgvr_format.py --check          # report the files that would change, write nothing
    python Tools/cgvr_format.py --verify REF     # prove the working tree differs from git REF by layout only
    python Tools/cgvr_format.py FILE ...         # format the given files

Generators import format_text() so that what they write is already in this layout.
"""
import argparse
import concurrent.futures
import os
import re
import subprocess
import sys

ROOT = os.path.dirname( os.path.dirname( os.path.abspath( __file__ ) ) )
STYLE_BASE = os.path.join( ROOT, ".clang-format" )
STYLE_WRAP = os.path.join( ROOT, "Tools", "clang-format-wrap120.yaml" )
LIMIT = 120

# Comment lines the app reads at run time (EffectShader: "// @chainclasses chainAP a|b|c", @chainord, @chainss,
# @chainopening, @chainbake; gen.py's "// @expr"): one line each, never wrapped or reflowed.
DIRECTIVE = re.compile( r"^[ \t]*//[ \t]*@\w" )

CPP_DIRS = ( "Source", "PresetEditor", "SetupTool" )
GLSL_DIRS = ( "Scene2D", "Scene3D", "FX", "Transitions", "Engine" )
CPP_EXT = ( ".cpp", ".h", ".c", ".hh" )
GLSL_EXT = ( ".frag", ".vert", ".comp", ".geom", ".tesc", ".tese", ".glsl" )


def find_clang_format():
    """Locates clang-format.exe: CLANG_FORMAT, then the Visual Studio LLVM toolsets, then PATH."""
    env = os.environ.get( "CLANG_FORMAT" )
    if env and os.path.isfile( env ):
        return env
    for base in ( r"C:\Program Files\Microsoft Visual Studio\18", r"C:\Program Files\Microsoft Visual Studio\2022" ):
        for edition in ( "Community", "Professional", "Enterprise" ):
            p = os.path.join( base, edition, r"VC\Tools\Llvm\x64\bin\clang-format.exe" )
            if os.path.isfile( p ):
                return p
    return "clang-format"


CLANG_FORMAT = find_clang_format()


def run_clang_format( text, style, assume, lines=None ):
    """Runs clang-format on text (stdin) with a style file; lines limits it to (first, last) 1-based ranges."""
    cmd = [ CLANG_FORMAT, "--style=file:" + style, "--assume-filename=" + assume ]
    for a, b in lines or ():
        cmd.append( "--lines=%d:%d" % ( a, b ) )
    r = subprocess.run( cmd, input=text.encode( "utf-8" ), capture_output=True )
    if r.returncode != 0:
        raise RuntimeError( "clang-format failed on %s: %s" % ( assume, r.stderr.decode( "utf-8", "replace" ) ) )
    return r.stdout.decode( "utf-8" )


def assumed_name( path ):
    """GLSL is formatted as C++; C++ keeps its own name so that .h files are read as headers."""
    return "shader.cpp" if path.lower().endswith( GLSL_EXT ) else os.path.basename( path )


def format_text( text, path ):
    """Returns text in the CGVR layout: pass 1 everywhere, pass 2 only on lines longer than LIMIT."""
    crlf = "\r\n" in text
    work = text.replace( "\r\n", "\n" )
    assume = assumed_name( path )
    # Repeat both passes until nothing moves: a wrapped declaration ends an aligned group, which pass 1 then
    # re-aligns; the result must be a fixed point so that formatting a formatted file changes nothing.
    # With ColumnLimit 0 clang-format leaves lambda bodies (Qt connect callbacks) exactly as they were, tabs and
    # all; lines still indented by a tab after pass 1 therefore get the 120-column style as well.
    for _ in range( 6 ):
        start = work
        work = run_clang_format( work, STYLE_BASE, assume )
        lines = work.split( "\n" )
        code_lines = split_code_comments( work )[ 0 ].split( "\n" )
        targets = [ i for i, l in enumerate( lines, 1 )
                    if not DIRECTIVE.match( l )
                    and ( len( l ) > LIMIT or ( l.startswith( "\t" ) and code_lines[ i - 1 ].startswith( "\t" ) ) ) ]
        if targets:
            work = run_clang_format( work, STYLE_WRAP, assume, [ ( i, i ) for i in targets ] )
        if work == start:
            break
    return work.replace( "\n", "\r\n" ) if crlf else work


# ---------------------------------------------------------------------------------------------------------------
#  Proof that a reformatted text means the same: tokens and comment words
# ---------------------------------------------------------------------------------------------------------------

PUNCT = sorted( """>>= <<= ... -> ++ -- << >> <= >= == != && || += -= *= /= %= &= |= ^= :: ## .*
                   ->* { } [ ] ( ) ; : , . ? ~ ! + - * / % ^ & | = < > #""".split(), key=len, reverse=True )
TOKEN_RE = re.compile(
    r'R"(?P<d>[^(\s]*)\(.*?\)(?P=d)"'           # raw string
    r'|(?:u8|u|U|L)?"(?:\\.|[^"\\\n])*"'         # string literal
    r"|(?:u8|u|U|L)?'(?:\\.|[^'\\\n])*'"         # character literal
    r"|\.?\d(?:[eEpP][+-]|[\w.'])*"              # pp-number
    r"|[A-Za-z_]\w*"
    r"|" + "|".join( re.escape( p ) for p in PUNCT ) + r"|\S", re.S )


def split_code_comments( text ):
    """Splits text into code (comments replaced by a space) and the list of comment bodies."""
    code, comments, i, n = [], [], 0, len( text )
    while i < n:
        c = text[ i ]
        if text.startswith( "//", i ):
            j = text.find( "\n", i )
            j = n if j < 0 else j
            while j < n and text[ j - 1 ] == "\\":          # a line comment continued by a backslash
                k = text.find( "\n", j + 1 )
                j = n if k < 0 else k
            comments.append( text[ i + 2:j ] )
            code.append( " " )
            i = j
        elif text.startswith( "/*", i ):
            j = text.find( "*/", i + 2 )
            j = n if j < 0 else j + 2
            comments.append( text[ i + 2:j - 2 ] )
            code.append( "\n" * text.count( "\n", i, j ) or " " )
            i = j
        elif c == '"' or c == "'" or ( c == "R" and text.startswith( 'R"', i ) ):
            m = TOKEN_RE.match( text, i )
            j = m.end() if m and m.end() > i else i + 1
            code.append( text[ i:j ] )
            i = j
        else:
            code.append( c )
            i += 1
    return "".join( code ), comments


def blank_code( text ):
    """text with comments and string/character literals replaced by spaces, length and newlines kept."""
    out, i, n = list( text ), 0, len( text )
    while i < n:
        if text.startswith( "//", i ):
            j = text.find( "\n", i )
            j = n if j < 0 else j
        elif text.startswith( "/*", i ):
            j = text.find( "*/", i + 2 )
            j = n if j < 0 else j + 2
        elif text[ i ] in "\"'":
            q, j = text[ i ], i + 1
            while j < n and text[ j ] != q and text[ j ] != "\n":
                j += 2 if text[ j ] == "\\" else 1
            j = min( j + 1, n )
        else:
            i += 1
            continue
        for k in range( i, j ):
            if out[ k ] != "\n":
                out[ k ] = " "
        i = j
    return "".join( out )


def signature( text ):
    """Token sequence of text without comments and layout; preprocessor lines are single units."""
    code, comments = split_code_comments( text.replace( "\r\n", "\n" ) )
    out, body, lines, k = [], [], code.split( "\n" ), 0
    while k < len( lines ):
        line = lines[ k ]
        if line.lstrip().startswith( "#" ):
            pp = line
            while pp.endswith( "\\" ) and k + 1 < len( lines ):
                k += 1
                pp = pp[ :-1 ] + " " + lines[ k ]
            out.extend( tokenize( " ".join( body ) ) )      # code tokens are strings ...
            body = []
            m = re.match( r"\s*#\s*define\s+\w+(\()?", pp )
            out.append( ( bool( m and m.group( 1 ) ), tuple( tokenize( pp ) ) ) )   # ... a directive is a tuple
        else:
            body.append( line )
        k += 1
    out.extend( tokenize( " ".join( body ) ) )
    # Doxygen markers at the start of a comment (///<, //!<, /**<, ///, //!) are markup, not words: a long
    # trailing ///< comment wrapped by clang-format continues with another ///<, which Doxygen joins.
    comments = [ re.sub( r"^[/!*]?<?", "", c ) for c in comments ]
    words = " ".join( re.sub( r"(^|\n)\s*(\*+|//+|/\*+)", " ", c ) for c in comments ).split()
    words = [ w for w in words if w not in ( "*", "**", "/", "*/" ) ]
    return out, words


def tokenize( s ):
    """Maximal-munch tokens of a code string."""
    return [ m.group( 0 ) for m in TOKEN_RE.finditer( s ) ]


def same_meaning( before, after ):
    """Returns '' if after differs from before by layout only, else a short reason."""
    db = [ l.strip() for l in before.replace( "\r\n", "\n" ).split( "\n" ) if DIRECTIVE.match( l ) ]
    da = [ l.strip() for l in after.replace( "\r\n", "\n" ).split( "\n" ) if DIRECTIVE.match( l ) ]
    if db != da:
        return "run-time comment directives (// @...) changed"
    tb, wb = signature( before )
    ta, wa = signature( after )
    if tb != ta:
        for i, ( x, y ) in enumerate( zip( tb, ta ) ):
            if x != y:
                return "tokens differ at %d: %r -> %r" % ( i, x, y )
        return "token count %d -> %d" % ( len( tb ), len( ta ) )
    if wb != wa:
        for i, ( x, y ) in enumerate( zip( wb, wa ) ):
            if x != y:
                return "comment words differ at %d: %r -> %r" % ( i, x, y )
        return "comment word count %d -> %d" % ( len( wb ), len( wa ) )
    return ""


# ---------------------------------------------------------------------------------------------------------------
#  Driver
# ---------------------------------------------------------------------------------------------------------------

def all_files():
    """Every C++ source of the app, the preset editor and the setup tool, and every shader."""
    files = []
    for d, ext in [ ( d, CPP_EXT ) for d in CPP_DIRS ] + [ ( d, GLSL_EXT ) for d in GLSL_DIRS ]:
        for base, _, names in os.walk( os.path.join( ROOT, d ) ):
            files += [ os.path.join( base, n ) for n in names if n.lower().endswith( ext ) and not n.startswith( ( "moc_", "ui_", "qrc_" ) ) ]
    return sorted( files )


def read( path ):
    with open( path, "rb" ) as f:
        return f.read().decode( "utf-8" )


def process( path, write ):
    """Formats one file; returns (path, status, detail) with status one of same/changed/refused/error."""
    try:
        before = read( path )
        after = format_text( before, path )
        if after == before:
            return path, "same", ""
        why = same_meaning( before, after )
        if why:
            return path, "refused", why
        if write:
            with open( path, "wb" ) as f:
                f.write( after.encode( "utf-8" ) )
        return path, "changed", ""
    except Exception as e:                                   # report and keep going with the other files
        return path, "error", str( e )


def verify( ref, files ):
    """Compares every file with its version in git ref; returns the number of files whose meaning changed."""
    bad = 0
    for path in files:
        rel = os.path.relpath( path, ROOT ).replace( "\\", "/" )
        r = subprocess.run( [ "git", "-C", ROOT, "show", "%s:%s" % ( ref, rel ) ], capture_output=True )
        if r.returncode != 0:
            continue                                         # new file: nothing to compare with
        why = same_meaning( r.stdout.decode( "utf-8" ), read( path ) )
        if why:
            bad += 1
            print( "MEANING CHANGED %s: %s" % ( rel, why ) )
    print( "verified %d files against %s: %d changed in meaning" % ( len( files ), ref, bad ) )
    return bad


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "files", nargs="*" )
    ap.add_argument( "--check", action="store_true", help="report only, write nothing" )
    ap.add_argument( "--verify", metavar="REF", help="prove the files differ from git REF by layout only" )
    ap.add_argument( "--jobs", type=int, default=12 )
    a = ap.parse_args()
    files = [ os.path.abspath( f ) for f in a.files ] or all_files()
    if a.verify:
        return 1 if verify( a.verify, files ) else 0
    counts, problems = {}, []
    with concurrent.futures.ThreadPoolExecutor( a.jobs ) as ex:
        for path, status, detail in ex.map( lambda p: process( p, not a.check ), files ):
            counts[ status ] = counts.get( status, 0 ) + 1
            if status in ( "refused", "error" ):
                problems.append( "%s %s: %s" % ( status.upper(), os.path.relpath( path, ROOT ), detail ) )
    for p in problems:
        print( p )
    print( "files: %d  %s" % ( len( files ), "  ".join( "%s %d" % kv for kv in sorted( counts.items() ) ) ) )
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit( main() )
