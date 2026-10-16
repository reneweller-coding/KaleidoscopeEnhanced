# -*- coding: utf-8 -*-
"""Function comments of the GLSL shaders in the layout of the CGVR comment template.

    /**  One line: what the function does.
     *
     * @param uv  The coordinate. (in)
     * @param n   Receives the normal. (out)
     *
     * @return
     *   What comes back.
     *
     * The detailed description ...
     **/

doc_shaders.annotate() calls function_block() for every top-level function definition; the block above the function
(///, /** */ or a plain // paragraph) is parsed into brief, parameters, return value and details and written back in
the template's order.  A parameter's direction is its GLSL qualifier: out is (out), inout is (in,out), everything
else (in).  Descriptions that the block lacks come from Tools/glsl_doc_table.py: first for the function and its
parameter types, then for the function, then -- for the conventionally named parameters only -- for the parameter
name.  What is still missing is collected in GAPS.  FIXES (same keys) correct texts a block already carries but that
were written for another overload of the name.
"""
import os
import re
import sys

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_comments as C                                   # noqa: E402
import cgvr_glsl_names as N                                 # noqa: E402
from glsl_doc_table import FIXES, FUNC_DOCS, PARAM_DOCS, PATTERN_DOCS, VERTEX_VALUE  # noqa: E402

try:
    from glsl_doc_briefs import BRIEFS                      # noqa: E402
except ImportError:
    BRIEFS = {}

GAPS = []                     # (function, types, what, path)
SIG = re.compile( r"^((?:[A-Za-z_]\w*\s+)+)([A-Za-z_]\w*)\s*\(" )
QUALIFIERS = ( "in", "out", "inout", "const", "highp", "mediump", "lowp", "precise" )


def signature( lines, i ):
    """(return type, name, [(qualifier, type, name)], index of the line with the closing parenthesis) of the
    function whose header starts on line i, or None."""
    m = SIG.match( lines[ i ] )
    if not m:
        return None
    text, k = lines[ i ].split( "//", 1 )[ 0 ], i
    start = text.index( "(" )

    def close():
        """Index of the parenthesis that closes the parameter list (a one-line body has parentheses of its own)."""
        depth = 0
        for j in range( start, len( text ) ):
            depth += { "(": 1, ")": -1 }.get( text[ j ], 0 )
            if depth == 0:
                return j
        return None
    end = close()
    while end is None and k + 1 < len( lines ):
        k += 1
        text += " " + lines[ k ].split( "//", 1 )[ 0 ]
        end = close()
    inner = text[ start + 1:end ] if end is not None else ""
    params = []
    for p in inner.split( "," ):
        p = re.sub( r"/\*.*?\*/", "", p ).split( "//", 1 )[ 0 ].strip()
        if not p or p == "void":
            continue
        toks = p.replace( "[", " [" ).split()
        toks = [ t for t in toks if not t.startswith( "[" ) ]
        if len( toks ) < 2:
            continue
        quals = [ t for t in toks[ :-2 ] if t in QUALIFIERS ]
        direction = "out" if "out" in quals else "inout" if "inout" in quals else "in"
        params.append( ( direction, toks[ -2 ], toks[ -1 ] ) )
    return m.group( 1 ).split()[ -1 ], m.group( 2 ), params, k


def lookup( name, types, path="" ):
    """The table entries for a function, most specific first: for its file ("File.frag::name(types)",
    "File.frag::name"), for its parameter types, for its name."""
    out = []
    for k in keys( name, types, path ):
        if k in FUNC_DOCS and FUNC_DOCS[ k ] not in out:
            out.append( FUNC_DOCS[ k ] )
    # naming conventions last: sd* distance functions, f* folds, hash* ...
    key = name + "(" + ",".join( types ) + ")"
    out += [ dict( e, pattern=True ) for pattern, e in PATTERN_DOCS if re.match( pattern, key ) ]
    return out


def keys( name, types, path, plain=True ):
    """The table keys of a function, most specific first; plain adds the bare name."""
    base = os.path.basename( path ) + "::"
    # the chain passes make_chainpass.py writes (Engine/ChainPass/Final_X.frag, Geom_X.frag) share X.frag's helpers
    lab = re.sub( r"^(Final|Geom)_", "", base )
    out = []
    # the generators annotate before Tools/cgvr_glsl_names.py renames (stageAk_0 -> stageAk0): the table has the new names
    for n in ( name, N.new_function( name ) ):
        if n:
            key = n + "(" + ",".join( types ) + ")"
            out += [ base + key, base + n, lab + key, lab + n, key ] + ( [ n ] if plain else [] )
    return out


def fixes( name, types, path ):
    """The FIXES entries for a function: (field, parameter, wrong text or None, right text)."""
    out = []
    for k in keys( name, types, path, plain=False ):
        out += FIXES.get( k, [] )
    return out


def doc_block_above( out ):
    """(first index, text lines) of the comment block at the end of out that documents the next line, or None."""
    if not out:
        return None
    j = len( out ) - 1
    s = out[ j ].strip()
    if s.endswith( "*/" ) and not s.startswith( "//" ):
        k = j
        while k >= 0 and "/*" not in out[ k ]:
            k -= 1
        if k >= 0 and out[ k ].strip().startswith( ( "/**", "/*!" ) ) and not out[ k ].strip().startswith( "/***" ):
            return k, C.strip_markers( out[ k:j + 1 ] )
        return None
    if s.startswith( "//" ) and not s.startswith( ( "///<", "//!<" ) ) and not re.match( r"^//\s*(-{3,}|={3,}|@)", s ):
        k = j
        while k - 1 >= 0 and out[ k - 1 ].strip().startswith( "//" ) and not out[ k - 1 ].strip().startswith( ( "///<", "//!<" ) ) \
                and not re.match( r"^//\s*(-{3,}|={3,}|@)", out[ k - 1 ].strip() ):
            k -= 1
        # the rest of a section heading that runs over several lines ("// ---- Sky shell: ... ----") is no description
        if re.search( r"\s-{3,}\s*$", s ) or ( k > 0 and re.match( r"^//\s*-{3,}\s+\S", out[ k - 1 ].strip() )
                                                and not re.search( r"-{3,}\s*$", out[ k - 1 ].strip() ) ):
            return None
        return k, [ re.sub( r"^\s*//[/!]?\s?", "", l ) for l in out[ k:j + 1 ] ]
    return None


def function_block( out, lines, i, path, main_brief, briefs ):
    """Replaces the comment above the function on lines[i] (already at the end of out) by the template block."""
    sig = signature( lines, i )
    if not sig:
        return
    ret, name, params, _ = sig
    types = [ t for _, t, _ in params ]
    found = doc_block_above( out )
    first = found[ 0 ] if found else len( out )
    model = C.parse( found[ 1 ] ) if found else C.parse( [] )
    entries = lookup( name, types, path )
    corrections = fixes( name, types, path )
    if not model[ "brief" ]:
        # the table for this function, the one-liners of doc_shaders, the most common one of the shaders, the naming
        # conventions last
        specific = [ e for e in entries if not e.get( "pattern" ) ]
        renamed = N.new_function( name ) or name
        model[ "brief" ] = main_brief if name == "main" else next( ( e[ "brief" ] for e in specific if e.get( "brief" ) ), "" ) \
            or briefs.get( name, "" ) or briefs.get( renamed, "" ) \
            or BRIEFS.get( name + "(" + ",".join( types ) + ")", "" ) or BRIEFS.get( renamed + "(" + ",".join( types ) + ")", "" ) \
            or next( ( e[ "brief" ] for e in entries if e.get( "brief" ) ), "" )
    for field, _, wrong, right in corrections:
        if field == "brief" and ( wrong is None or model[ "brief" ] == wrong ):
            model[ "brief" ] = right
    if not model[ "brief" ]:
        GAPS.append( ( name, types, "brief", path ) )
        return
    documented = { n: d for n, d in model[ "params" ] }
    new_params = []
    for direction, ptype, pname in params:
        d = documented.get( pname )
        if d is None:
            d = next( ( e[ "params" ][ pname ] for e in entries if pname in e.get( "params", {} ) ), None )
        if d is None:
            d = PARAM_DOCS.get( pname + ":" + ptype ) or PARAM_DOCS.get( pname )
        if d is None and ptype in ( "float", "int", "uint" ) and any( e.get( "vertex_values" ) for e in entries ):
            d = VERTEX_VALUE
        if d is None:
            GAPS.append( ( name, types, "parameter " + pname, path ) )
            d = ""
        d = re.sub( r"\s*\((in|out|in,\s*out)\)\s*$", "", d ).strip()
        for field, fixed, wrong, right in corrections:
            if field == "param" and fixed == pname and ( wrong is None or d == wrong ):
                d = right
        tag = { "in": "(in)", "out": "(out)", "inout": "(in,out)" }[ direction ]
        new_params.append( [ pname, ( d + " " + tag ).strip() ] )
    model[ "params" ] = new_params
    for field, _, wrong, right in corrections:
        if field == "return" and ( wrong is None or model[ "return" ] == wrong ):
            model[ "return" ] = right
    if ret != "void" and not model[ "return" ] and not model[ "retvals" ]:
        # a pattern may word the result differently for a single number ("return_scalar")
        r = next( ( e.get( "return_scalar" ) if ret in ( "float", "int", "uint" ) and e.get( "return_scalar" ) else e[ "return" ]
                    for e in entries if e.get( "return" ) ), "" )
        if not r:
            GAPS.append( ( name, types, "return value", path ) )
        model[ "return" ] = r
    block = C.render( model, "" )
    out[ first: ] = block


def collect_briefs( paths ):
    """{name(types): the most common one-line description} of every function that has one in some shader."""
    import collections
    seen = collections.defaultdict( collections.Counter )
    for p in paths:
        lines = open( p, "rb" ).read().decode( "utf-8", "replace" ).replace( "\r\n", "\n" ).split( "\n" )
        depth = 0
        for i, l in enumerate( lines ):
            code = l.split( "//", 1 )[ 0 ]
            if depth == 0 and not l.startswith( ( " ", "\t", "#" ) ) and SIG.match( l ) \
                    and not re.match( r"^(return|else|if|for|while|layout)\b", l.strip() ):
                sig = signature( lines, i )
                found = doc_block_above( lines[ :i ] )
                if sig and found:
                    brief = C.parse( found[ 1 ] )[ "brief" ]
                    if brief:
                        seen[ sig[ 1 ] + "(" + ",".join( t for _, t, _ in sig[ 2 ] ) + ")" ][ brief ] += 1
            depth = max( depth + code.count( "{" ) - code.count( "}" ), 0 )
    return { k: c.most_common( 1 )[ 0 ][ 0 ] for k, c in seen.items() }


def write_briefs( paths, target ):
    """Writes BRIEFS (collect_briefs()) to target as a Python module."""
    briefs = collect_briefs( paths )
    with open( target, "w", encoding="utf-8", newline="\n" ) as fh:
        fh.write( "# -*- coding: utf-8 -*-\n" )
        fh.write( '"""The one-line descriptions the shaders already give their functions, by name and parameter types.\n\n'
                  "Generated by Tools/glsl_docs.py --briefs; Tools/glsl_docs.py takes a function's description from here\n"
                  'where one copy of it lacks the comment the other copies have.\n"""\n\n' )
        fh.write( "BRIEFS = {\n" )
        for k in sorted( briefs ):
            fh.write( "    %r: %r,\n" % ( k, briefs[ k ] ) )
        fh.write( "}\n" )
    return len( briefs )


if __name__ == "__main__":
    import doc_shaders
    if "--briefs" in sys.argv:
        n = write_briefs( list( doc_shaders.files() ), os.path.join( os.path.dirname( os.path.abspath( __file__ ) ),
                                                                     "glsl_doc_briefs.py" ) )
        print( "briefs: %d" % n )
