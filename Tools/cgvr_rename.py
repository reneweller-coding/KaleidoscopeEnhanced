# -*- coding: utf-8 -*-
"""Renames C++ identifiers after the CGVR naming rules: clang-tidy finds them, the names are formed here.

clang-tidy's readability-identifier-naming (configured in .clang-tidy) finds every declaration that breaks a
rule and every reference to it, semantically, across all translation units (Tools/cgvr_tidy.py runs them).
Its own suggestions are not used: it would turn kMaxNum into KMaxNum and scenes3D into scenes3_d.  The new
names follow the guidelines' examples instead:

    local variable     applyBench   -> apply_bench      (mylocalvar, my_local_var)
    constant           kMaxSections -> MaxSections      (const int MaxNum = 10)
    class variable     s_frozen     -> M_Frozen         (M_MyClassVar)
    instance variable  vertices     -> m_vertices       (m_var)
    enum type          CueSection   -> CueSectionE      (myEnumTypeE)
    enum member        Intro        -> INTRO            (COL_TRUE)
    typedef / alias    Clock        -> ClockT           (SomeThingT)

A rename is refused, and listed, when its new name already occurs as an identifier where it could clash (in the
file for a local, anywhere in the C++ for everything else) or is a keyword.  After applying, every old name that
still occurs in code is listed: a reference clang-tidy did not see (inside a macro, in an #if branch not
compiled on Windows) that has to be done by hand.  Doc comments follow the rename where the old name is
distinctive enough (kMaxSections, s_frozen, CueSection) not to be an ordinary word.

Usage:
    python Tools/cgvr_rename.py --plan        # what would be renamed, the refusals; change nothing
    python Tools/cgvr_rename.py --apply       # rename
"""
import argparse
import collections
import concurrent.futures
import glob
import os
import re
import sys
import tempfile

import yaml

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_tidy as tidy                                    # noqa: E402
from cgvr_format import split_code_comments, blank_code     # noqa: E402

ROOT = tidy.ROOT
MESSAGE = re.compile( r"invalid case style for (?P<cat>.+?) '(?P<name>\w+)'" )
LOCAL = { "local variable", "local constant", "local pointer", "local constant pointer" }
CONSTANT = { "global constant", "static constant", "class constant", "constexpr variable" }

# Names of other people's interfaces: the OpenGL API's typedefs, the class uic generates.
KEEP = { "GLchar", "GLsizeiptr", "GLintptr", "GLDEBUGPROCKC", "Ui_MainWindow" }
# Names no rule can derive: (category, name) or (category, name, file) -> new name.
MANUAL = {
    ( "function", "T" ): "uiText",                     # Strings::T( id ): the UI text of a string id
    ( "function", "S" ): "uiString",                   # SetupTool's QString wrapper of Strings::uiText()
    ( "function", "ROUND" ): "roundHalfUp",            # RenderPipeline.cpp: rounds halves up
    ( "class constant", "SV_TRANSZ" ): "StartViewTransZ",   # legacy trackball constants: start / projection view z
    ( "class constant", "PV_TRANSZ" ): "ProjViewTransZ",
    ( "global constant", "kCfxInfo" ): "CfxInfoTable",       # the table of CfxInfo rows (CfxInfo is the row type)
    ( "local pointer", "L", "effectshader.cpp" ): "locs",    # the audio uniforms' locations
    ( "static constant", "s", "glwidget.h" ): "Sweep",      # KALEIDO_SCENE_SWEEP / KALEIDO_FX_SWEEP, read once
    ( "static constant", "t", "renderpipeline.cpp" ): "FreezeTime",   # KALEIDO_FREEZE_TIME, read once
    ( "local variable", "H", "mesh.cpp" ): "box_height",
    ( "local variable", "V", "renderpipeline.cpp" ): "view_matrix",
    ( "local variable", "P", "renderpipeline.cpp" ): "proj_matrix",
}
KEYWORDS = set( """alignas alignof and asm auto bitand bitor bool break case catch char class compl concept const
    consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do
    double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable
    namespace new noexcept not nullptr operator or private protected public register reinterpret_cast requires
    return short signed sizeof static static_assert static_cast struct switch template this thread_local throw
    true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor""".split() )


def words( name ):
    """Splits an identifier into its words: m_shProgId -> [sh, prog, id]; scenes3D -> [scenes, 3d]."""
    name = re.sub( r"^(m_|s_|g_|M_)", "", name )
    out = []
    for part in [ p for p in name.split( "_" ) if p ]:
        part = re.sub( r"(?<=[a-z])(\d+[A-Z])(?![a-z])", r"_\1_", part )    # scenes3D: 3D is one word
        part = re.sub( r"(?<=[a-z])(?=[A-Z])", "_", part )                  # camel humps
        part = re.sub( r"(?<=[0-9])(?=[A-Z][a-z])", "_", part )             # fbo2Tex: a word after a number
        part = re.sub( r"(?<=[A-Z])(?=[A-Z][a-z])", "_", part )             # end of an acronym
        out += [ w for w in part.split( "_" ) if w ]
    return out


def camel( ws ):
    return "".join( w[ :1 ].upper() + w[ 1: ].lower() if w.isupper() and len( w ) > 1 and not w[ 0 ].isdigit()
                    else w[ :1 ].upper() + w[ 1: ] for w in ws )


def strip_k( name ):
    """kMaxNum -> MaxNum: the k of the old constant convention goes."""
    return name[ 1: ] if re.match( r"^k[A-Z0-9]", name ) else name


def new_name( cat, name, path="" ):
    """The CGVR name for an identifier of a clang-tidy category (declared in path), or None to keep it."""
    if name in KEEP:
        return None
    for key in ( ( cat, name, os.path.basename( path ).lower() ), ( cat, name ) ):
        if key in MANUAL:
            return MANUAL[ key ]
    if cat in LOCAL:
        if re.match( r"^k[A-Z]", name ):            # a named constant (kStereoNames), even where the array is not const
            return strip_k( name )
        if cat == "local constant" and name[ :1 ].isupper():           # W, H, N, MaxN: already a named constant
            return name if len( name ) <= 2 or not name.isupper() else camel( words( name ) )
        if cat == "local constant" and re.match( r"^k[A-Z]", name ):    # a named constant, not a const value
            return camel( words( strip_k( name ) ) ) if not strip_k( name )[ :1 ].isupper() else strip_k( name )
        return "_".join( w.lower() for w in words( name ) )
    if cat in CONSTANT:
        n = strip_k( name )
        if n.isupper():                                                   # FOO_BAR -> FooBar
            return camel( words( n ) )
        return n[ :1 ].upper() + n[ 1: ] if "_" not in n else camel( words( n ) )
    if cat == "class member":
        n = re.sub( r"^(s_|m_|k)", "", name )
        return "M_" + ( n[ :1 ].upper() + n[ 1: ] if "_" not in n else camel( words( n ) ) )
    if cat in ( "private member", "protected member" ):
        ws = words( name )
        return "m_" + ws[ 0 ].lower() + "".join( w[ :1 ].upper() + w[ 1: ].lower() if w.isupper() else w[ :1 ].upper() + w[ 1: ] for w in ws[ 1: ] )
    if cat == "enum":
        n = re.sub( r"_e$", "", name )
        return camel( words( n ) ) + "E"
    if cat in ( "enum constant", "scoped enum constant" ):
        return "_".join( w.upper() for w in words( strip_k( name ) ) )
    if cat in ( "typedef", "type alias", "type template parameter" ):
        n = re.sub( r"_t$", "", name )
        return camel( words( n ) ) + "T"
    if cat in ( "union", "class", "struct" ):
        return camel( words( name ) )
    if cat in ( "method", "function" ):
        ws = words( name )
        return ws[ 0 ].lower() + "".join( w[ :1 ].upper() + w[ 1: ] for w in ws[ 1: ] )
    return None


def our_files():
    files = []
    for d in tidy.PROJECTS:
        base = os.path.dirname( os.path.join( ROOT, d ) )
        sub = "Source" if base == ROOT else ""
        files += glob.glob( os.path.join( base, sub, "*.cpp" ) ) + glob.glob( os.path.join( base, sub, "*.h" ) )
    return sorted( { os.path.normcase( os.path.normpath( f ) ) for f in files if not os.path.basename( f ).startswith( ( "moc_", "ui_", "qrc_" ) ) } )


def code_identifiers( text ):
    """Identifier tokens of the code (comments and strings left out)."""
    code = split_code_comments( text )[ 0 ]
    code = re.sub( r'"(?:\\.|[^"\\\n])*"', '""', code )
    return re.findall( r"\b[A-Za-z_]\w*\b", code )


def collect():
    """{(decl file, decl offset): {cat, name, refs: {(file, offset, length)}}} from clang-tidy's exported fixes."""
    units = tidy.write_db()
    env = tidy.msvc_env()
    fixes_dir = tempfile.mkdtemp( prefix="cgvr_rename_" )
    with concurrent.futures.ThreadPoolExecutor( 12 ) as ex:
        results = list( ex.map( lambda u: tidy.run_unit( u, env, fixes_dir, "readability-identifier-naming" ), units ) )
    groups = {}
    for _, _, path in results:
        if not path:
            continue
        data = yaml.safe_load( open( path, encoding="utf-8" ) ) or {}
        for d in data.get( "Diagnostics", [] ):
            msg = d.get( "DiagnosticMessage", {} )
            m = MESSAGE.search( msg.get( "Message", "" ) )
            if not m:
                continue
            key = ( os.path.normcase( os.path.normpath( msg[ "FilePath" ] ) ), msg[ "FileOffset" ] )
            g = groups.setdefault( key, { "cat": m.group( "cat" ), "name": m.group( "name" ), "refs": set() } )
            for r in msg.get( "Replacements", [] ) or []:
                g[ "refs" ].add( ( os.path.normcase( os.path.normpath( r[ "FilePath" ] ) ), r[ "Offset" ], r[ "Length" ] ) )
    return { k: g for k, g in groups.items() if tidy.OURS.search( k[ 0 ] ) }


def plan( groups ):
    """Adds 'new' to every group; returns (accepted groups, refusals)."""
    texts = { f: open( f, encoding="utf-8", errors="replace" ).read() for f in our_files() }
    ids_in = { f: set( code_identifiers( t ) ) for f, t in texts.items() }
    all_ids = set().union( *ids_in.values() )
    accepted, refused = [], []
    new_targets = collections.Counter()
    for ( f, off ), g in sorted( groups.items() ):
        n = new_name( g[ "cat" ], g[ "name" ], f )
        if n is None or n == g[ "name" ]:
            continue
        g[ "new" ] = n
        if n in KEYWORDS:
            refused.append( ( g, "keyword" ) )
            continue
        if g[ "cat" ] in LOCAL:
            clash = n in ids_in.get( f, set() )
        elif g[ "cat" ] in ( "private member", "protected member" ):       # members of other classes may share it
            clash = any( n in ids_in.get( rf, set() ) for rf in { r[ 0 ] for r in g[ "refs" ] } | { f } )
        else:
            clash = n in all_ids
        if clash:
            refused.append( ( g, "'%s' already occurs" % n ) )
            continue
        if not g[ "refs" ]:
            refused.append( ( g, "no fix offered (macro?)" ) )
            continue
        accepted.append( ( f, off, g ) )
        new_targets[ ( f if g[ "cat" ] in LOCAL else "", n ) ] += 1
    return accepted, refused


def enclosing_block( code, off ):
    """(start, end) of the innermost { } block around offset off, or None at file or namespace scope."""
    depth, i = 0, off
    while i > 0:
        i -= 1
        if code[ i ] == "}":
            depth += 1
        elif code[ i ] == "{":
            if depth == 0:
                head = code[ max( 0, i - 200 ):i ]
                if re.search( r"\b(namespace|class|struct|union|enum)\b[^;{}()]*$", head ) or re.search( r'extern\s*$', head ):
                    return None
                break
            depth -= 1
    else:
        return None
    depth, j = 0, i
    while j < len( code ):
        if code[ j ] == "{":
            depth += 1
        elif code[ j ] == "}":
            depth -= 1
            if depth == 0:
                return i, j
        j += 1
    return i, len( code )


DECL_BEFORE = re.compile( r"(?:[\w>*&]\s+|[*&])$" )


def missed_references( accepted ):
    """References in a local's (or a function-local static's) block that clang-tidy did not offer to rename.

    They are what clang-tidy cannot see: code in an #if branch not compiled on Windows, or inside a macro.
    Returns [(group, file, offset, safe, line text)]; safe means no second declaration of the name in the block,
    so the reference can only be the renamed variable.
    """
    out, texts = [], {}
    for f, off, g in accepted:
        if g[ "cat" ] not in LOCAL and g[ "cat" ] != "static constant":
            continue
        if f not in texts:
            raw = open( f, "rb" ).read().decode( "latin-1" )                 # byte offsets = character offsets
            texts[ f ] = ( raw, blank_code( raw ) )
        raw, code = texts[ f ]
        block = enclosing_block( code, off )
        if block is None:
            continue
        refs = { ro for rf, ro, rl in g[ "refs" ] if rf == f }
        hits = [ m.start() for m in re.finditer( r"(?<![\w.$])%s(?!\w)" % re.escape( g[ "name" ] ), code[ block[ 0 ]:block[ 1 ] ] ) ]
        hits = [ block[ 0 ] + h for h in hits if not code[ :block[ 0 ] + h ].rstrip().endswith( ( "->", "::" ) ) ]
        missed = [ h for h in hits if h not in refs and h >= off ]
        if not missed:
            continue
        decls = [ h for h in hits if h != off and DECL_BEFORE.search( code[ max( 0, h - 40 ):h ] )
                  and not re.search( r"\b(return|case|else|delete|new|throw|sizeof)\s*$", code[ max( 0, h - 40 ):h ] ) ]
        for h in missed:
            line = raw[ raw.rfind( "\n", 0, h ) + 1:raw.find( "\n", h ) ].strip()
            out.append( ( g, f, h, not decls, line ) )
    return out


def distinctive( name ):
    """Whether a name is unlike an ordinary word, so that a comment mentioning it means the identifier."""
    return bool( re.search( r"[a-z][A-Z]|\d|_|^k[A-Z]", name ) ) and len( name ) > 2


def apply( accepted ):
    """Applies the renames by byte offset; then the comments; returns the per-file edit count."""
    edits = collections.defaultdict( set )
    for f, off, g in accepted:
        for rf, ro, rl in g[ "refs" ]:
            edits[ rf ].add( ( ro, rl, g[ "name" ], g[ "new" ] ) )
    bad = []
    for rf, es in edits.items():
        data = open( rf, "rb" ).read()
        last = None
        for ro, rl, old, new in sorted( es, reverse=True ):
            if data[ ro:ro + rl ].decode( "utf-8", "replace" ) != old or ( last is not None and ro + rl > last ):
                bad.append( "%s@%d: expected %s, found %r" % ( rf, ro, old, data[ ro:ro + rl ] ) )
                continue
            data = data[ :ro ] + new.encode( "utf-8" ) + data[ ro + rl: ]
            last = ro
        open( rf, "wb" ).write( data )
    return edits, bad


def fix_comments( accepted ):
    """Renames distinctive old names inside the comments of our C++ files; returns the number of changes."""
    renames = {}
    for f, off, g in accepted:
        if distinctive( g[ "name" ] ):
            renames.setdefault( g[ "name" ], set() ).add( ( g[ "new" ], f if g[ "cat" ] in LOCAL else None ) )
    changed = 0
    for path in our_files():
        text = open( path, encoding="utf-8", newline="" ).read()
        code_ids = set( code_identifiers( text ) )

        def sub_comment( m ):
            c = m.group( 0 )
            for old, targets in renames.items():
                if old not in c or len( targets ) != 1:
                    continue
                new, scope = next( iter( targets ) )
                if ( scope and scope != os.path.normcase( path ) ) or old in code_ids:
                    continue
                c = re.sub( r"(?<![\w$])%s(?!\w)" % re.escape( old ), new, c )
            return c
        new_text = re.sub( r"//[^\n]*|/\*.*?\*/", sub_comment, text, flags=re.S )
        if new_text != text:
            changed += 1
            open( path, "w", encoding="utf-8", newline="" ).write( new_text )
    return changed


def leftovers( accepted ):
    """Old names that still occur in code where they were renamed (a macro, an #if branch clang-tidy skipped)."""
    out = []
    texts = { f: open( f, encoding="utf-8", errors="replace" ).read() for f in our_files() }
    ids = { f: collections.Counter( code_identifiers( t ) ) for f, t in texts.items() }
    for f, off, g in accepted:
        if g[ "cat" ] in LOCAL or g[ "cat" ] == "static constant" or not distinctive( g[ "name" ] ):
            continue                                        # block-scoped ones: see missed_references()
        for s in texts:
            if ids.get( s, {} ).get( g[ "name" ] ):
                # another entity of the same name (a second local elsewhere in the file) is fine; listed to look at
                out.append( "%s: '%s' (%s) still occurs %d x" % ( os.path.relpath( s, ROOT ), g[ "name" ], g[ "cat" ], ids[ s ][ g[ "name" ] ] ) )
    return sorted( set( out ) )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--plan", action="store_true" )
    ap.add_argument( "--apply", action="store_true" )
    a = ap.parse_args()
    groups = collect()
    accepted, refused = plan( groups )
    by_cat = collections.Counter( g[ "cat" ] for _, _, g in accepted )
    print( "renames: %d   refused: %d" % ( len( accepted ), len( refused ) ) )
    for c, n in by_cat.most_common():
        print( "  %5d  %s" % ( n, c ) )
    for g, why in refused:
        where = sorted( g[ "refs" ] )[ 0 ] if g[ "refs" ] else ( "", 0, 0 )
        print( "REFUSED %-22s %-28s -> %-28s %s  %s@%d" % ( g[ "cat" ], g[ "name" ], g.get( "new", "" ), why,
                                                          os.path.relpath( where[ 0 ], ROOT ) if where[ 0 ] else "", where[ 1 ] ) )
    missed = missed_references( accepted )
    for g, f, h, safe, line in missed:
        print( "MISSED %-6s %-24s %s@%d: %s" % ( "safe" if safe else "CHECK", g[ "name" ], os.path.relpath( f, ROOT ), h, line[ :110 ] ) )
    if a.plan:
        for f, off, g in accepted:
            print( "  %-22s %-30s -> %-30s %s (%d refs)" % ( g[ "cat" ], g[ "name" ], g[ "new" ], os.path.relpath( f, ROOT ), len( g[ "refs" ] ) ) )
    if a.apply:
        for g, f, h, safe, line in missed:
            if safe:
                g[ "refs" ].add( ( f, h, len( g[ "name" ] ) ) )
        edits, bad = apply( accepted )
        for b in bad:
            print( "SKIPPED", b )
        print( "renamed in %d files (%d edits)" % ( len( edits ), sum( len( v ) for v in edits.values() ) ) )
        print( "comments changed in %d files" % fix_comments( accepted ) )
        for l in leftovers( accepted ):
            print( "LEFTOVER", l )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
