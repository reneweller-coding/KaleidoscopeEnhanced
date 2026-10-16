# -*- coding: utf-8 -*-
"""Renames GLSL identifiers after the CGVR naming rules, and proves each file still means the same.

clang-tidy does not read GLSL, so the scopes are found here: function bodies (by brace matching on the code with
comments and strings blanked out), the declarations in them, the file's global constants, macros and functions.

    local variable      lightDir   -> light_dir     (mylocalvar, my_local_var)
    local constant      TAU        -> Tau           (a named constant: const int MaxNum = 10)
    global constant     PI, kTanY  -> Pi, TanY
    macro               spacing    -> SPACING       (#define DEBUG_ON)
    function            hue_of     -> hueOf         (calcSomeCoolValue)

Left alone, as the contracts between the shaders and the rest of the system: every uniform, in/out variable,
buffer and struct member; parameters (the guidelines give no rule); one- and two-letter upper-case locals such as
N, L, P, R2 (the vectors of shading maths, which would clash with their lower-case scalar or 2D namesakes); global
constants that mirror a knob uniform (`const float chainAP = 0.47;`, read by EffectShader::parseChainSource());
functions the app looks up by name (permCode).  A rename whose new name already occurs in the file is refused.

The proof: every new name is new to its file, so mapping the new names back must give exactly the old token
sequence (Tools/cgvr_format.signature: tokens without comments and layout, preprocessor lines included).

Usage:
    python Tools/cgvr_glsl_names.py --plan [FILE ...]    # what would change, per kind; nothing written
    python Tools/cgvr_glsl_names.py --apply [FILE ...]   # rename (all shaders when no file is given)
Generators call rename_text() on what they write.
"""
import argparse
import collections
import os
import re
import sys

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_format                                          # noqa: E402

BUILTIN_TYPES = set( """void bool int uint float double vec2 vec3 vec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 uvec2 uvec3
    uvec4 dvec2 dvec3 dvec4 mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4""".split() )
QUALIFIERS = set( "const highp mediump lowp precise in out inout flat smooth noperspective".split() )
RESERVED = set( """attribute const uniform varying buffer shared coherent volatile restrict readonly writeonly
    atomic_uint layout centroid flat smooth noperspective patch sample break continue do for while switch case default
    if else subroutine in out inout invariant precise discard return true false struct lowp mediump highp precision
    common partition active asm class union enum typedef template this resource goto inline noinline public static
    extern external interface long short half fixed unsigned superp input output filter sizeof cast namespace using
    radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt
    abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf length
    distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse
    lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture textureLod texelFetch
    textureSize textureGrad textureOffset textureProj textureGather dFdx dFdy fwidth main""".split() ) | BUILTIN_TYPES
KEEP_FUNCTIONS = { "main", "permCode" }      # permCode: EffectShader::returnedValues( text, "permCode" )
GLSL_EXT = cgvr_format.GLSL_EXT


def words( name ):
    """Words of an identifier: lightDir -> [light, Dir]; sampleUV -> [sample, UV]; uv2D -> [uv, 2D]."""
    out = []
    for part in [ p for p in name.split( "_" ) if p ]:
        part = re.sub( r"(?<=[a-z])(\d+[A-Z])(?![a-z])", r"_\1_", part )
        part = re.sub( r"(?<=[a-z])(?=[A-Z])", "_", part )
        part = re.sub( r"(?<=[0-9])(?=[A-Z][a-z])", "_", part )
        part = re.sub( r"(?<=[A-Z])(?=[A-Z][a-z])", "_", part )
        out += [ w for w in part.split( "_" ) if w ]
    return out


def snake( name ):
    return "_".join( w.lower() for w in words( name ) )


def camel_upper( name ):
    return "".join( w[ :1 ].upper() + ( w[ 1: ].lower() if w.isupper() else w[ 1: ] ) for w in words( name ) )


def camel_lower( name ):
    ws = words( name )
    return ws[ 0 ].lower() + "".join( w[ :1 ].upper() + ( w[ 1: ].lower() if w.isupper() else w[ 1: ] ) for w in ws[ 1: ] )


def math_name( name ):
    """N, L, P, ND, R2, P0: the one- and two-letter upper-case vectors of shading maths."""
    return bool( re.match( r"^[A-Z]{1,2}\d*$", name ) )


def new_local( name, const ):
    if re.match( r"^[a-z][a-z0-9_]*$", name ) or math_name( name ):
        return None
    if const and re.match( r"^[A-Z][A-Za-z0-9]*$", name ) and not name.isupper():
        return None                                  # a named constant written like MaxNum already
    if const and ( name.isupper() or re.match( r"^k[A-Z]", name ) ):          # TAU -> Tau, kSteps -> Steps
        return camel_upper( name[ 1: ] if re.match( r"^k[A-Z]", name ) else name )
    return snake( name )


def new_global_const( name ):
    if re.match( r"^[a-z]\w*P$", name ) or re.match( r"^[A-Z]\d*$", name ):
        return None                                  # knob mirror (frozen like) or one letter: E, M2, R0
    if name == "M_PI":
        return "Pi"
    if re.match( r"^[A-Z][A-Za-z0-9]*$", name ) and not name.isupper():
        return None                                  # already MaxNum
    n = name[ 1: ] if re.match( r"^k[A-Z]", name ) else name
    new = camel_upper( n )
    return None if new == name else new


def new_function( name ):
    if name in KEEP_FUNCTIONS or re.match( r"^[a-z][A-Za-z0-9]*$", name ):
        return None
    return camel_lower( name )


def new_macro( name ):
    if re.match( r"^[A-Z][A-Z0-9_]*$", name ) or name.startswith( "SPEC_" ):
        return None
    return "_".join( w.upper() for w in words( name ) )


IDENT = re.compile( r"[A-Za-z_]\w*" )


def matching_brace( code, open_pos ):
    depth = 0
    for i in range( open_pos, len( code ) ):
        if code[ i ] == "{":
            depth += 1
        elif code[ i ] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len( code )


def analyse( text ):
    """Finds the scopes and declarations of one shader: functions, global constants, macros, struct names."""
    code = cgvr_format.blank_code( text )
    structs = set( re.findall( r"\bstruct\s+(\w+)", code ) )
    types = BUILTIN_TYPES | structs
    pp_lines = [ m for m in re.finditer( r"^[ \t]*#.*$", code, re.M ) ]
    pp_idents = set( IDENT.findall( " ".join( m.group( 0 ) for m in pp_lines ) ) )
    code_np = re.sub( r"^[ \t]*#.*$", lambda m: " " * len( m.group( 0 ) ), code, flags=re.M )   # no directives
    functions, depth, i = [], 0, 0
    type_alt = "|".join( sorted( types, key=len, reverse=True ) )
    fdef = re.compile( r"\b(?:%s)\s+(\w+)\s*\(([^()]*)\)\s*\{" % type_alt )
    while i < len( code_np ):
        c = code_np[ i ]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif depth == 0:
            m = fdef.match( code_np, i )
            if m and ( i == 0 or not ( code_np[ i - 1 ].isalnum() or code_np[ i - 1 ] == "_" ) ):
                open_pos = m.end() - 1
                close = matching_brace( code_np, open_pos )
                params = set( IDENT.findall( m.group( 2 ) ) )
                functions.append( { "name": m.group( 1 ), "start": m.start(), "open": open_pos, "close": close, "params": params } )
                i = close + 1
                continue
        i += 1
    # declarations inside bodies: a type at the start of a statement, then its declarators
    decl = re.compile( r"(?:(?<=[;{}(])|^)\s*((?:(?:%s)\s+)*)(%s)\s+(?=[A-Za-z_])" % ( "|".join( QUALIFIERS ), type_alt ), re.M )
    for f in functions:
        body = code_np[ f[ "open" ] + 1:f[ "close" ] ]
        locals_ = {}
        for m in decl.finditer( body ):
            const = "const" in m.group( 1 ).split()
            j, d = m.end(), 0
            expect_name = True
            while j < len( body ):
                ch = body[ j ]
                if expect_name:
                    nm = IDENT.match( body, j )
                    if not nm:
                        break
                    locals_.setdefault( nm.group( 0 ), const )
                    j = nm.end()
                    expect_name = False
                    continue
                if ch in "([{":
                    d += 1
                elif ch in ")]}":
                    if d == 0:
                        break
                    d -= 1
                elif ch == "," and d == 0:
                    expect_name = True
                    j += 1
                    while j < len( body ) and body[ j ].isspace():
                        j += 1
                    continue
                elif ch == ";" and d == 0:
                    break
                j += 1
        f[ "locals" ] = locals_
    # global constants: depth-0 statements starting with const
    globals_const, depth = [], 0
    for m in re.finditer( r"[{}]|(?:^|(?<=[;}]))\s*const\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)", code_np, re.M ):
        if m.group( 0 ) == "{":
            depth += 1
        elif m.group( 0 ) == "}":
            depth -= 1
        elif depth == 0 and m.group( 2 ):
            globals_const.append( m.group( 2 ) )
    macros = re.findall( r"^[ \t]*#[ \t]*define[ \t]+(\w+)", code, re.M )
    outside = list( code_np )
    for f in functions:
        for k in range( f[ "open" ], f[ "close" ] + 1 ):
            outside[ k ] = " "
    file_scope = set( IDENT.findall( "".join( outside ) ) )      # uniforms, in/out, globals, signatures
    return { "code": code, "functions": functions, "globals_const": globals_const, "macros": macros,
             "structs": structs, "pp_idents": pp_idents, "file_scope": file_scope }


def plan_text( text ):
    """Returns (renames, refusals): renames = [(scope range or None, old, new, kind)]."""
    a = analyse( text )
    code = a[ "code" ]
    present = set( IDENT.findall( code ) )
    taken = set( present )
    renames, refused = [], []
    global_names = set( a[ "globals_const" ] ) | set( a[ "macros" ] ) | { f[ "name" ] for f in a[ "functions" ] }

    def ok( new, old, kind, scope=None ):
        if new in taken or new in RESERVED or new.startswith( "gl_" ) or "__" in new:
            refused.append( ( old, new, kind, "'%s' already occurs or is reserved" % new ) )
            return False
        return True

    for name in sorted( set( a[ "macros" ] ) ):
        n = new_macro( name )
        if n and ok( n, name, "macro" ):
            renames.append( ( None, name, n, "macro" ) )
            taken.add( n )
    for name in sorted( set( a[ "globals_const" ] ) ):
        n = new_global_const( name )
        if n and ok( n, name, "global constant" ):
            renames.append( ( None, name, n, "global constant" ) )
            taken.add( n )
    for name in sorted( { f[ "name" ] for f in a[ "functions" ] } ):
        n = new_function( name )
        if n and ok( n, name, "function" ):
            renames.append( ( None, name, n, "function" ) )
            taken.add( n )
    local_new = {}
    for f in a[ "functions" ]:
        for name, const in sorted( f[ "locals" ].items() ):
            n = new_local( name, const )
            if not n:
                continue
            if name in a[ "pp_idents" ] or name in f[ "params" ] or name in global_names or name in a[ "file_scope" ]:
                refused.append( ( name, n, "local", "also a macro word, a parameter or a file-scope name" ) )
                continue
            key = ( name, n )
            if key not in local_new:                 # the same old -> new in several functions is one fresh name
                if not ok( n, name, "local" ):
                    continue
                local_new[ key ] = True
                taken.add( n )
            renames.append( ( ( f[ "open" ], f[ "close" ] ), name, n, "local constant" if const else "local" ) )
    # one old name renamed differently in two places would break the inverse map: refuse those
    news = collections.defaultdict( set )
    for scope, old, new, kind in renames:
        news[ new ].add( old )
    clash = { n for n, olds in news.items() if len( olds ) > 1 }
    if clash:
        refused += [ ( old, new, kind, "two names would become '%s'" % new ) for scope, old, new, kind in renames if new in clash ]
        renames = [ r for r in renames if r[ 2 ] not in clash ]
    return renames, refused


def rename_text( text, path="shader.frag" ):
    """text with the identifiers renamed (comments mentioning a distinctive old name follow); proof inside."""
    renames, _ = plan_text( text )
    if not renames:
        return text
    code = cgvr_format.blank_code( text )
    global_map = { old: new for scope, old, new, kind in renames if scope is None }
    local_maps = collections.defaultdict( dict )
    for scope, old, new, kind in renames:
        if scope is not None:
            local_maps[ scope ][ old ] = new
    edits = []
    for m in IDENT.finditer( code ):
        if m.start() > 0 and code[ m.start() - 1 ] == ".":
            continue                                 # a member or swizzle, never ours
        name, new = m.group( 0 ), None
        for ( s, e ), mp in local_maps.items():
            if s < m.start() < e and name in mp:
                new = mp[ name ]
                break
        if new is None:
            new = global_map.get( name )
        if new:
            edits.append( ( m.start(), m.end(), new ) )
    out = text
    for s, e, new in reversed( edits ):
        out = out[ :s ] + new + out[ e: ]
    out = rename_comments( out, renames )
    prove( text, out, renames, path )
    return out


def layout_and_names( text, path ):
    """What a generator writes: the identifiers renamed, then the CGVR layout (alignment follows the names)."""
    return cgvr_format.format_text( rename_text( text, path ), path )


def rename_comments( text, renames ):
    """Distinctive old names (hue_of, lightDir, kTanY) in comments take the new name; plain words do not."""
    mp = { old: new for _, old, new, _ in renames if re.search( r"[a-z][A-Z]|_|\d|^k[A-Z]", old ) and len( old ) > 2 }
    if not mp:
        return text
    pat = re.compile( r"(?<![\w.])(%s)(?!\w)" % "|".join( re.escape( k ) for k in sorted( mp, key=len, reverse=True ) ) )

    def sub( m ):
        c = m.group( 0 )
        if re.match( r"//[ \t]*@\w", c ):
            return c                                 # run-time directives stay as they are
        return pat.sub( lambda x: mp[ x.group( 1 ) ], c )
    return re.sub( r"//[^\n]*|/\*.*?\*/", sub, text, flags=re.S )


def prove( before, after, renames, path ):
    """Raises if after is not before with fresh names: inverse-mapping after's tokens must give before's."""
    inv = {}
    for _, old, new, _ in renames:
        inv[ new ] = old
    tb, _ = cgvr_format.signature( before )
    ta, _ = cgvr_format.signature( after )

    def back( t ):
        if isinstance( t, tuple ):                   # a preprocessor line
            return ( t[ 0 ], tuple( inv.get( x, x ) for x in t[ 1 ] ) )
        return inv.get( t, t )
    ta = [ back( t ) for t in ta ]
    if ta != tb:
        for k, ( x, y ) in enumerate( zip( tb, ta ) ):
            if x != y:
                raise RuntimeError( "%s: renaming changed token %d: %r -> %r" % ( path, k, x, y ) )
        raise RuntimeError( "%s: renaming changed the token count" % path )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "files", nargs="*" )
    ap.add_argument( "--plan", action="store_true" )
    ap.add_argument( "--apply", action="store_true" )
    ap.add_argument( "--list", type=int, default=12 )
    a = ap.parse_args()
    files = [ os.path.abspath( f ) for f in a.files ] or [ f for f in cgvr_format.all_files() if f.lower().endswith( GLSL_EXT ) ]
    kinds, examples, refusals, changed, errors = collections.Counter(), collections.defaultdict( collections.Counter ), [], 0, []
    for f in files:
        text = cgvr_format.read( f )
        renames, refused = plan_text( text )
        for _, old, new, kind in renames:
            kinds[ kind ] += 1
            examples[ kind ][ "%s->%s" % ( old, new ) ] += 1
        refusals += [ ( os.path.relpath( f, cgvr_format.ROOT ), ) + r for r in refused ]
        if a.apply and renames:
            try:
                out = layout_and_names( text, f )
                if out != text:
                    with open( f, "wb" ) as fh:
                        fh.write( out.encode( "utf-8" ) )
                    changed += 1
            except Exception as e:                   # report, keep the file as it was
                errors.append( str( e ) )
    print( "files: %d" % len( files ) )
    for k, n in kinds.most_common():
        print( "  %6d  %-16s %s" % ( n, k, ", ".join( "%s(%d)" % kv for kv in examples[ k ].most_common( a.list ) ) ) )
    print( "refused: %d" % len( refusals ) )
    for r in refusals[ :a.list * 3 ]:
        print( "  REFUSED %s: %s -> %s (%s) %s" % r )
    if a.apply:
        print( "files written: %d, errors: %d" % ( changed, len( errors ) ) )
        for e in errors[ :20 ]:
            print( "  ERROR", e[ :200 ] )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit( main() )
