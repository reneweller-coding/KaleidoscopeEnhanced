# -*- coding: utf-8 -*-
"""Lays the C++ function comments out after the CGVR comment template (template-comments.cpp).

    /**  One line: what the function does.
     *
     * @param name      what it is (in)
     * @param result    what it receives (out)
     *
     * @return
     *   What comes back.
     *
     * The detailed description ...
     *
     * @warning / @pre / @sideeffects / @todo / @bug / @internal / @see
     **/

Doxygen's XML names every function, its parameters and their types; the comment block right above the
declaration (and the one above the definition, where there is one) is parsed into brief, parameters, return value,
details and the other sections, and written back in the template's order.  Every parameter gets its direction from
its type: by value and through const references or pointers it is (in); a non-const reference is (in,out), and
(out) where the description says the parameter receives or is filled; a non-const pointer is (in) -- the object is
handed over -- unless the description says it receives or is filled.  Descriptions that were missing come from
SUPPLEMENT (Tools/cgvr_comment_supplement.py); `@sideeffects` lists the class variables (M_...) and file-static
variables (s_...) a function body assigns.

A comment trailing a function (`int n() { ... } ///< ...`) moves above it.  A parameter or return value documented
both above the declaration and above the definition stays above the declaration only (Doxygen merges the two blocks
and would report it twice).  Doxygen's line numbers lag behind after multi-line `///<` comments, so each function is
looked up by its name and parameter names from the reported line on.  The rewrite changes comments only; check it
with `cgvr_format.signature()` against the previous revision.

Usage:
    python Tools/cgvr_comments.py              # what would change, and what is still missing
    python Tools/cgvr_comments.py --show 20    # ... with the first 20 blocks before and after
    python Tools/cgvr_comments.py --apply      # rewrite the comment blocks
"""
import argparse
import collections
import os
import re
import sys
import textwrap

sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import cgvr_doxygen                                         # noqa: E402
import cgvr_format                                          # noqa: E402

try:
    from cgvr_comment_supplement import SUPPLEMENT          # noqa: E402
except ImportError:
    SUPPLEMENT = {}

ROOT = cgvr_doxygen.ROOT
WIDTH = 116
SECTION = r"brief|short|param|tparam|return|returns|result|retval|note|notes|warning|attention|pre|post|see|sa|throw|throws|exception|todo|bug|internal|deprecated|remark|remarks|since|details|par|sideeffects"
SECTION_AT = re.compile( r"(?:^|(?<=\s))[@\\](" + SECTION + r")\b(\[[^\]]*\])?", re.M )
ORDER_AFTER = [ "throw", "warning", "pre", "post", "sideeffects", "todo", "bug", "internal", "note", "deprecated", "see" ]
ALIAS = { "returns": "return", "result": "return", "short": "brief", "throws": "throw", "exception": "throw",
          "sa": "see", "notes": "note", "remark": "note", "remarks": "note", "attention": "warning" }
ABBREV = re.compile( r"\b(e\.g|i\.e|etc|vs|cf|approx|incl|resp|min|max|no|Fig|Eq|ca|al|St)\.$", re.I )


# ---------------------------------------------------------------------------------------------------------------
#  Finding and parsing a comment block
# ---------------------------------------------------------------------------------------------------------------

def block_above( lines, decl ):
    """(first, last) 0-based line indices of the doc comment block that ends just above line index decl, or None."""
    i = decl - 1
    while i >= 0 and re.match( r"^\s*(template\s*<.*>|Q_INVOKABLE|\[\[[^\]]*\]\])\s*$", lines[ i ] ):
        i -= 1
    # Doxygen attaches a block across blank lines too
    blank = 0
    while i >= 0 and not lines[ i ].strip() and blank < 2:
        i -= 1
        blank += 1
    if i < 0:
        return None
    s = lines[ i ].strip()
    if s.startswith( ( "///", "//!" ) ) and not s.startswith( ( "///<", "//!<" ) ):
        j = i
        while j - 1 >= 0 and lines[ j - 1 ].strip().startswith( ( "///", "//!" ) ) and not lines[ j - 1 ].strip().startswith( ( "///<", "//!<" ) ):
            j -= 1
        return j, i
    if s.endswith( "*/" ):
        j = i
        while j >= 0 and "/*" not in lines[ j ]:
            j -= 1
        if j >= 0 and re.match( r"^\s*/\*[*!](?!\*)", lines[ j ] ) and lines[ j ].strip().startswith( ( "/**", "/*!" ) ):
            return j, i
    return None


def find_decl( lines, line, m, span=60 ):
    """0-based index of the line that declares member m, searched from Doxygen's (1-based) line on.

    Doxygen's line numbers fall behind by one for every continuation line of a trailing `///<` comment, so the
    reported line may lie above the declaration; the parameter names tell overloads apart."""
    name = m[ "name" ].split( "::" )[ -1 ]
    pat = re.compile( r"\boperator\b" if name.startswith( "operator" ) else r"(^|[^\w~])" + re.escape( name ) + r"\s*(\(|$)" )
    names = [ n for t, n in m[ "params" ] if n ]
    for i in range( max( 0, line - 1 ), min( len( lines ), line + span ) ):
        code = re.sub( r"//.*$|/\*.*?(\*/|$)", "", lines[ i ] )      # a name in a comment declares nothing
        if pat.search( code ) and not lines[ i ].strip().startswith( ( "//", "*", "/*" ) ):
            head = " ".join( lines[ i:i + 6 ] )
            if all( re.search( r"\b" + re.escape( n ) + r"\b", head ) for n in names ):
                return i
    # a definition may name its parameters differently; its qualified name is unique enough
    cls = m[ "qualified" ].rsplit( "::", 1 )[ 0 ] if "::" in m[ "qualified" ] else ""
    if cls:
        qual = re.compile( re.escape( cls.split( "::" )[ -1 ] ) + r"::" + re.escape( name ) + r"\s*\(" )
        for i in range( max( 0, line - 1 ), min( len( lines ), line + span ) ):
            if qual.search( re.sub( r"//.*$|/\*.*?(\*/|$)", "", lines[ i ] ) ):
                return i
    return None


def decl_end( lines, decl ):
    """0-based index of the line that ends the declaration starting at decl (its `;` or its body's `}`)."""
    depth = 0
    body = False
    for i in range( decl, min( len( lines ), decl + 400 ) ):
        code = re.sub( r'"(\\.|[^"\\])*"|\'(\\.|[^\'\\])*\'', '""', lines[ i ] )
        code = re.sub( r"//.*$", "", code )
        code = re.sub( r"/\*.*?\*/", "", code )
        for c in code:
            if c in "({[":
                depth += 1
                body = body or ( c == "{" and depth == 1 )
            elif c in ")}]":
                depth -= 1
                if depth == 0 and c == "}" and body:
                    return i
            elif c == ";" and depth == 0 and not body:
                return i
    return None


TRAIL = re.compile( r"^(.*?[;}])\s*(///<|//!<)\s?(.*)$" )


def trailing_doc( lines, end ):
    """(code line without the comment, comment text lines, last line index) of a trailing `///<` comment on line end."""
    t = TRAIL.match( lines[ end ] )
    if not t:
        return None
    text = [ t.group( 3 ) ]
    last = end
    while last + 1 < len( lines ) and re.match( r"^\s*(///<|//!<)", lines[ last + 1 ] ):
        last += 1
        text.append( re.sub( r"^\s*(///<|//!<)\s?", "", lines[ last ] ) )
    return t.group( 1 ).rstrip(), text, last


def strip_markers( block_lines ):
    """The text of a comment block, comment syntax removed, relative indentation kept."""
    first = block_lines[ 0 ].strip()
    out = []
    if first.startswith( ( "///", "//!" ) ):
        for l in block_lines:
            out.append( re.sub( r"^\s*(///|//!) ?", "", l.rstrip( "\r" ) ) )
        return out
    body = "\n".join( l.rstrip( "\r" ) for l in block_lines )
    body = re.sub( r"^\s*/\*[*!]", "", body, count=1 )
    body = re.sub( r"\*+/\s*$", "", body )
    for l in body.split( "\n" ):
        out.append( re.sub( r"^\s*\* ?", "", l ) if re.match( r"^\s*\*", l ) else l.strip() if not l.startswith( "   " ) else l )
    while out and not out[ 0 ].strip():
        out.pop( 0 )
    while out and not out[ -1 ].strip():
        out.pop()
    return out


def parse( text_lines ):
    """Splits comment text into {brief, details, params: [(name, desc)], tparams, return, retvals, other: [(tag, text)]}."""
    model = { "brief": "", "details": [], "params": [], "tparams": [], "return": "", "retvals": [], "other": [] }
    # a reflowed line may end in "@param" with the parameter name on the next line
    joined = []
    for l in text_lines:
        if joined and re.search( r"[@\\]t?param\s*$", joined[ -1 ] ) and l.strip():
            joined[ -1 ] = joined[ -1 ].rstrip() + " " + l.strip()
        else:
            joined.append( l )
    # split single lines that carry several sections ("@brief X. @param a b. @return c")
    lines = []
    in_code = False
    for l in joined:
        if re.search( r"[@\\](code|verbatim)\b", l ):
            in_code = True
        if in_code:
            lines.append( l )
            if re.search( r"[@\\](endcode|endverbatim)\b", l ):
                in_code = False
            continue
        cuts = [ m.start() for m in SECTION_AT.finditer( l ) if m.start() > 0 and not re.match( r"[@\\](par)\b", l[ m.start(): ] ) ]
        prev = 0
        for c in cuts:
            if l[ prev:c ].strip():
                lines.append( l[ prev:c ].rstrip() )
            prev = c
        lines.append( l[ prev: ].rstrip() if cuts else l.rstrip() )
    cur = None          # (kind, key) of the section being filled
    paragraph_break = False
    in_code = False
    for l in lines:
        if in_code:
            model[ "details" ].append( l )
            in_code = not re.search( r"[@\\](endcode|endverbatim)\b", l )
            continue
        if re.match( r"^\s*[@\\](code|verbatim)\b", l ):
            model[ "details" ].append( l )
            in_code = not re.search( r"[@\\](endcode|endverbatim)\b", l )
            cur = ( "details", None )
            continue
        if not l.strip():
            paragraph_break = True
            if cur and cur[ 0 ] == "details":
                model[ "details" ].append( "" )
            continue
        m = re.match( r"^\s*[@\\](" + SECTION + r")\b(\[[^\]]*\])?\s*(.*)$", l )
        if m:
            tag = ALIAS.get( m.group( 1 ), m.group( 1 ) )
            rest = m.group( 3 )
            if tag == "brief":
                model[ "brief" ] = ( model[ "brief" ] + " " + rest ).strip()
                cur = ( "brief", None )
            elif tag in ( "param", "tparam" ):
                pm = re.match( r"(\[[^\]]*\]\s*)?(\w+(?:\s*,\s*\w+)*)\s*(.*)$", rest )
                name, desc = ( pm.group( 2 ), pm.group( 3 ) ) if pm else ( rest, "" )
                model[ tag + "s" ].append( [ name, desc.strip() ] )
                cur = ( tag + "s", len( model[ tag + "s" ] ) - 1 )
            elif tag == "return":
                model[ "return" ] = ( model[ "return" ] + " " + rest ).strip()
                cur = ( "return", None )
            elif tag == "retval":
                model[ "retvals" ].append( rest.strip() )
                cur = ( "retvals", len( model[ "retvals" ] ) - 1 )
            elif tag == "details":
                model[ "details" ].append( rest )
                cur = ( "details", None )
            else:
                model[ "other" ].append( [ tag + ( m.group( 2 ) or "" ) if tag == "par" else tag, rest.strip() ] )
                cur = ( "other", len( model[ "other" ] ) - 1 )
            paragraph_break = False
            continue
        t = l.strip()
        if cur is None:
            if not model[ "brief" ]:
                model[ "brief" ] = t          # autobrief: the first paragraph's first sentence
                cur = ( "autobrief", None )
            else:
                model[ "details" ].append( l )
                cur = ( "details", None )
        elif paragraph_break or cur[ 0 ] == "details":
            if paragraph_break and model[ "details" ] and model[ "details" ][ -1 ] != "":
                model[ "details" ].append( "" )
            model[ "details" ].append( l )
            cur = ( "details", None )
        elif cur[ 0 ] in ( "brief", "autobrief" ):
            model[ "brief" ] += " " + t
        elif cur[ 0 ] in ( "params", "tparams" ):
            model[ cur[ 0 ] ][ cur[ 1 ] ][ 1 ] = ( model[ cur[ 0 ] ][ cur[ 1 ] ][ 1 ] + " " + t ).strip()
        elif cur[ 0 ] == "return":
            model[ "return" ] = ( model[ "return" ] + " " + t ).strip()
        elif cur[ 0 ] == "retvals":
            model[ "retvals" ][ cur[ 1 ] ] = ( model[ "retvals" ][ cur[ 1 ] ] + " " + t ).strip()
        elif cur[ 0 ] == "other":
            model[ "other" ][ cur[ 1 ] ][ 1 ] = ( model[ "other" ][ cur[ 1 ] ][ 1 ] + " " + t ).strip()
        paragraph_break = False
    # an autobrief is only the first sentence; the rest of that paragraph belongs to the details
    if model[ "brief" ]:
        first, rest = split_first_sentence( model[ "brief" ] )
        model[ "brief" ] = first
        if rest:
            model[ "details" ] = [ rest, "" ] + model[ "details" ] if model[ "details" ] else [ rest ]
    while model[ "details" ] and not model[ "details" ][ -1 ].strip():
        model[ "details" ].pop()
    return model


def split_first_sentence( text ):
    """(first sentence, rest) as Doxygen's autobrief cuts it: at the first '. ' that ends a sentence."""
    for m in re.finditer( r"[.!?](\s+)", text ):
        head = text[ :m.start() + 1 ]
        if ABBREV.search( head ) or re.search( r"\d\.$", head ) and re.match( r"\d", text[ m.end(): ] or "x" ):
            continue
        if head.endswith( ".." ):              # a range "0 .. 1" or an ellipsis, not the end of a sentence
            continue
        if head.count( "(" ) > head.count( ")" ) or head.count( "`" ) % 2:
            continue
        return head.strip(), text[ m.end(): ].strip()
    return text.strip(), ""


# ---------------------------------------------------------------------------------------------------------------
#  Directions, supplements, side effects
# ---------------------------------------------------------------------------------------------------------------

RECEIVES = re.compile( r"\b(receives?|receiving|filled|fills|written|output|out:|set to|gets? the|returns? (the|its|a)|stores?|is set)\b", re.I )


def direction( ptype, name, desc ):
    """(in), (out) or (in,out) for a parameter of C++ type ptype."""
    t = re.sub( r"\s+", " ", ptype.strip() )
    if re.match( r"^const\b", t ) and ( "&" in t or "*" in t ) and t.count( "*" ) <= 1:
        return "(in)"
    if "&" not in t and "*" not in t and "[" not in name:
        return "(in)"
    if t.endswith( "&&" ):
        return "(in)"
    if "&" in t:
        return "(out)" if RECEIVES.search( desc ) else "(in,out)"
    if RECEIVES.search( desc ):
        return "(out)"
    return "(in)"


def sideeffects( member ):
    """The class variables and file-static variables the function's body assigns."""
    f, start = member.get( "bodyfile" ), member.get( "bodystart" )
    if not f or not start:
        return []
    path = os.path.join( ROOT, f ) if not os.path.isabs( f ) else f
    try:
        lines = cgvr_format.read( path ).replace( "\r", "" ).split( "\n" )
    except OSError:
        return []
    code = cgvr_format.blank_code( "\n".join( lines[ start - 1: ] ) )
    depth, end = 0, len( code )
    for i, c in enumerate( code ):
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    body = code[ :end ]
    names = re.findall( r"(?<![\w.>:])((?:\w+::)?(?:M_|s_)\w+)\s*(?:\[[^\]]*\]\s*)?(?:[-+*/|&^]?=(?!=)|\+\+|--)", body )
    names += re.findall( r"(?:\+\+|--)\s*((?:\w+::)?(?:M_|s_)\w+)", body )
    return sorted( set( names ) )


def supplement( member ):
    """The written-out descriptions for a member: {"params": {name: desc}, "return": text, "brief": text}."""
    for key in ( member[ "qualified" ] + member[ "argsstring" ], member[ "qualified" ] ):
        if key in SUPPLEMENT:
            return SUPPLEMENT[ key ]
    if member[ "name" ] == "operator=" and "=delete" in member[ "argsstring" ]:
        return { "return": "Nothing: the operator is deleted, so no call compiles." }
    if member[ "name" ] == "operator=" and "=default" in member[ "argsstring" ]:
        return { "return": "This object, as assigned member by member." }
    return {}


# ---------------------------------------------------------------------------------------------------------------
#  Writing a block
# ---------------------------------------------------------------------------------------------------------------

def return_from_brief( brief ):
    """The @return text of a getter whose one-line description names what it returns."""
    if not brief:
        return ""
    r = re.sub( r"^(Returns\s+)?whether\s+", "True if ", brief, flags=re.I )
    r = re.sub( r"^Returns\s+(the|a|an)\s+", lambda g: g.group( 1 ).capitalize() + " ", r )
    return r


def wrap( text, first, rest ):
    return textwrap.wrap( text, width=max( 40, WIDTH - len( rest ) ), initial_indent="", subsequent_indent="",
                          break_long_words=False, break_on_hyphens=False ) or [ "" ]


def render( model, indent ):
    """The comment block of a model, CGVR template layout, as a list of lines without line ends."""
    p = indent + " * "
    out = []
    brief = model[ "brief" ]
    if not ( model[ "params" ] or model[ "tparams" ] or model[ "return" ] or model[ "retvals" ] or model[ "details" ] or model[ "other" ] ):
        one = indent + "/** " + brief + " */"
        if len( one ) <= WIDTH + 4:
            return [ one ]
    bl = wrap( brief, "", p )
    out.append( indent + "/**  " + bl[ 0 ] )
    out += [ p + l for l in bl[ 1: ] ]
    if model[ "tparams" ] or model[ "params" ]:
        out.append( p.rstrip() )
        width = max( len( n ) for n, _ in model[ "tparams" ] + model[ "params" ] )
        for tag, items in ( ( "tparam", model[ "tparams" ] ), ( "param", model[ "params" ] ) ):
            for n, d in items:
                head = "@%s %-*s  " % ( tag, width, n )
                ls = wrap( d, "", p + " " * len( head ) )
                out.append( p + head + ls[ 0 ] )
                out += [ p + " " * len( head ) + l for l in ls[ 1: ] ]
    if model[ "return" ] or model[ "retvals" ]:
        out.append( p.rstrip() )
        out.append( p + "@return" )
        if model[ "return" ]:
            out += [ p + "  " + l for l in wrap( model[ "return" ], "", p + "  " ) ]
        for r in model[ "retvals" ]:
            ls = wrap( r, "", p + "  " )
            out.append( p + "@retval " + ls[ 0 ] )
            out += [ p + "  " + l for l in ls[ 1: ] ]
    if model[ "details" ]:
        out.append( p.rstrip() )
        for l in model[ "details" ]:
            out.append( ( p + l ).rstrip() )
    others = sorted( model[ "other" ], key=lambda o: ORDER_AFTER.index( o[ 0 ] ) if o[ 0 ] in ORDER_AFTER else len( ORDER_AFTER ) )
    for tag, t in others:
        out.append( p.rstrip() )
        out.append( p + "@" + tag )
        out += [ p + "  " + l for l in wrap( t, "", p + "  " ) ]
    out.append( indent + " **/" )
    return out


# ---------------------------------------------------------------------------------------------------------------
#  Driver
# ---------------------------------------------------------------------------------------------------------------

def forward_declarations( m, texts ):
    """[(file, 1-based line)] of declarations (ending in ';') of a function Doxygen only reported the definition of:
    in the header of the same name and earlier in the defining file."""
    body = m[ "bodyfile" ] if os.path.isabs( m[ "bodyfile" ] ) else os.path.join( ROOT, m[ "bodyfile" ] )
    out = []
    if not body.endswith( ".cpp" ):
        return out          # an inline function in a header: another class may declare one of the same name
    for path in ( os.path.splitext( body )[ 0 ] + ".h", body ):
        if not os.path.exists( path ):
            continue
        if path not in texts:
            texts[ path ] = cgvr_format.read( path ).replace( "\r", "" ).split( "\n" )
        lines = texts[ path ]
        limit = m[ "bodystart" ] - 1 if path == body else len( lines )
        i = 0
        while i < limit:
            i = find_decl( lines, i + 1, m, limit - i )
            if i is None or i >= limit:
                break
            end = decl_end( lines, i )
            if end is not None and lines[ end ].split( "//" )[ 0 ].rstrip().endswith( ";" ):
                out.append( ( path, i + 1 ) )
                break
            i += 1
    return out


def plan( out_dir ):
    """{file: {(first, last): (model, member)}} for every function's doc block(s), plus the list of gaps."""
    members = cgvr_doxygen.members( out_dir )
    # a free function declared in a header is listed twice, once per file; the header's entry covers both blocks
    covered = { ( m[ "bodyfile" ], m[ "bodystart" ] ) for m in members if m[ "bodyfile" ] and m[ "bodyfile" ] != m[ "file" ] }
    members = [ m for m in members if not ( m[ "file" ] == m[ "bodyfile" ] and ( m[ "file" ], m[ "line" ] ) in covered ) ]
    blocks = collections.defaultdict( dict )
    gaps = []
    texts = {}
    for m in members:
        locations = [ ( m[ "file" ], m[ "line" ] ) ]
        if m[ "bodyfile" ] and ( m[ "bodyfile" ], m[ "bodystart" ] ) != ( m[ "file" ], m[ "line" ] ):
            locations.append( ( m[ "bodyfile" ], m[ "bodystart" ] ) )
        elif m[ "bodyfile" ]:
            # Doxygen may report only the definition of a function that a header or a forward declaration declares
            locations = forward_declarations( m, texts ) + locations
        found = []
        for f, line in locations:
            path = os.path.join( ROOT, f ) if not os.path.isabs( f ) else f
            if not cgvr_doxygen.CPP.search( path ) or not os.path.exists( path ):
                continue
            if path not in texts:
                texts[ path ] = cgvr_format.read( path ).replace( "\r", "" ).split( "\n" )
            lines = texts[ path ]
            decl = find_decl( lines, line, m )
            if decl is None:
                gaps.append( "%s:%d: no declaration of %s near this line" % ( os.path.relpath( path, ROOT ), line, m[ "qualified" ] ) )
                continue
            # the reported line is the name's; the block sits above the declaration's first line
            while decl > 0 and re.match( r"^\s*[\w:<>,&*\s]+$", lines[ decl - 1 ] ) and not lines[ decl - 1 ].strip().endswith( ( ";", "}", "{", "*/" ) ) \
                    and not lines[ decl - 1 ].strip().startswith( ( "//", "/*", "*", "#" ) ) and lines[ decl - 1 ].strip() not in ( "public:", "private:", "protected:" ):
                decl -= 1
            top = decl
            while top > 0 and re.match( r"^\s*(template\s*<.*>|Q_INVOKABLE|\[\[[^\]]*\]\])\s*$", lines[ top - 1 ] ):
                top -= 1
            b = block_above( lines, decl )
            end = decl_end( lines, decl )
            trail = trailing_doc( lines, end ) if end is not None else None
            # a trailing `///<` comment moves into the block above the function (CGVR: comments precede the code)
            if trail:
                code = lines[ ( b[ 1 ] + 1 if b else top ):end ] + [ trail[ 0 ] ]
                text = ( strip_markers( lines[ b[ 0 ]:b[ 1 ] + 1 ] ) + [ "" ] if b else [] ) + trail[ 1 ]
                rng = ( b[ 0 ] if b else top, trail[ 2 ] )
            elif b:
                code, text, rng = [], strip_markers( lines[ b[ 0 ]:b[ 1 ] + 1 ] ), b
            else:
                continue
            if any( r[ 0 ] <= rng[ 1 ] and rng[ 0 ] <= r[ 1 ] for r in blocks[ path ] ):
                if rng not in blocks[ path ]:
                    gaps.append( "%s:%d: block of %s overlaps another" % ( os.path.relpath( path, ROOT ), rng[ 0 ] + 1, m[ "qualified" ] ) )
                continue
            found.append( ( path, rng, text, code ) )
        if not found:
            continue
        sup = supplement( m )
        models = []
        for path, b, text, code in found:
            models.append( ( path, b, parse( text ), code ) )
        # Doxygen merges the declaration's and the definition's block: a parameter or return value documented in
        # both would be reported twice, so the declaration's block keeps it (with the definition's words if they
        # differ)
        first = models[ 0 ][ 2 ]
        bare = lambda t: re.sub( r"\s*\((in|out|in,\s*out)\)\s*$", "", t ).strip()
        same = lambda x, y: re.sub( r"\W+", " ", bare( x ) ).strip().lower() == re.sub( r"\W+", " ", bare( y ) ).strip().lower()
        for path, b, model, code in models[ 1: ]:
            for pd in list( model[ "params" ] ):
                twin = next( ( q for q in first[ "params" ] if q[ 0 ] == pd[ 0 ] ), None )
                if twin:
                    if not same( twin[ 1 ], pd[ 1 ] ):
                        twin[ 1 ] = bare( twin[ 1 ] ) + " " + bare( pd[ 1 ] )
                    model[ "params" ].remove( pd )
            if model[ "return" ] and first[ "return" ]:
                if not same( first[ "return" ], model[ "return" ] ):
                    first[ "return" ] = first[ "return" ].rstrip() + " " + model[ "return" ].strip()
                model[ "return" ] = ""
        # the block carrying parameters/return (or the declaration's) receives what is missing
        target = next( ( x for x in models if x[ 2 ][ "params" ] or x[ 2 ][ "return" ] ), models[ 0 ] )
        types = { n: t for t, n in m[ "params" ] }
        documented = { n for x in models for n, _ in x[ 2 ][ "params" ] }
        for t, n in m[ "params" ]:
            if n and n not in documented:
                d = sup.get( "params", {} ).get( n )
                if d:
                    target[ 2 ][ "params" ].append( [ n, d ] )
                else:
                    gaps.append( "%s: parameter %s" % ( m[ "qualified" ] + m[ "argsstring" ], n ) )
        order = [ n for t, n in m[ "params" ] ]
        for path, b, model, code in models:
            model[ "params" ].sort( key=lambda pd: order.index( pd[ 0 ] ) if pd[ 0 ] in order else len( order ) )
            for pd in model[ "params" ]:
                if pd[ 0 ] in types and not re.search( r"\((in|out|in,\s*out)\)\s*$", pd[ 1 ] ):
                    pd[ 1 ] = ( pd[ 1 ].rstrip() + " " + direction( types[ pd[ 0 ] ], pd[ 0 ], pd[ 1 ] ) ).strip()
        needs_return = m[ "type" ] not in ( "", "void" ) and not re.search( r"\bvoid(\s+(CALLBACK|APIENTRY|WINAPI))?$", m[ "type" ] ) \
            and not m[ "name" ].startswith( "~" ) and not ( "::" in m[ "qualified" ] and m[ "name" ] == m[ "qualified" ].split( "::" )[ -2 ] )
        if needs_return and not any( x[ 2 ][ "return" ] or x[ 2 ][ "retvals" ] for x in models ):
            brief = next( ( x[ 2 ][ "brief" ] for x in models if x[ 2 ][ "brief" ] ), "" )
            # a getter's one line names what it returns; another function's line says what it does
            getter = not m[ "params" ] or re.match( r"^(Returns\b|Whether\b|True\b)", brief )
            r = sup.get( "return" ) or ( return_from_brief( brief ) if getter else "" )
            if r:
                target[ 2 ][ "return" ] = r
            else:
                gaps.append( "%s: return value" % ( m[ "qualified" ] + m[ "argsstring" ] ) )
        if not any( x[ 2 ][ "brief" ] for x in models ):
            target[ 2 ][ "brief" ] = sup.get( "brief" ) or split_first_sentence( target[ 2 ][ "return" ] )[ 0 ]
            if not target[ 2 ][ "brief" ]:
                gaps.append( "%s: one-line description" % ( m[ "qualified" ] + m[ "argsstring" ] ) )
        se = sideeffects( m )
        if se and not any( o[ 0 ] == "sideeffects" for x in models for o in x[ 2 ][ "other" ] ):
            target[ 2 ][ "other" ].append( [ "sideeffects", "Changes " + ", ".join( se ) + "." ] )
        for path, b, model, code in models:
            blocks[ path ][ b ] = ( model, m, code )
    return blocks, gaps, texts


def apply( blocks, texts ):
    """Rewrites the blocks; returns the number of files written."""
    written = 0
    for path, bs in blocks.items():
        lines = texts[ path ]
        raw = cgvr_format.read( path )
        nl = "\r\n" if "\r\n" in raw else "\n"
        for ( first, last ), ( model, m, code ) in sorted( bs.items(), reverse=True ):
            indent = re.match( r"^\s*", lines[ first ] ).group( 0 )
            lines[ first:last + 1 ] = render( model, indent ) + code
        new = nl.join( lines )
        if new != raw:
            with open( path, "wb" ) as fh:
                fh.write( new.encode( "utf-8" ) )
            written += 1
    return written


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--apply", action="store_true", help="rewrite the blocks (else only report)" )
    ap.add_argument( "--dox", help="an existing Doxygen output directory (else Doxygen runs)" )
    ap.add_argument( "--show", type=int, default=0, help="print this many rewritten blocks" )
    a = ap.parse_args()
    out_dir = a.dox or cgvr_doxygen.run()[ 0 ]
    blocks, gaps, texts = plan( out_dir )
    n = sum( len( b ) for b in blocks.values() )
    print( "function comment blocks: %d in %d files; still missing: %d" % ( n, len( blocks ), len( gaps ) ) )
    for g in gaps[ :400 ]:
        print( "  MISSING", g )
    shown = 0
    for path, bs in blocks.items():
        for ( first, last ), ( model, m, code ) in sorted( bs.items() ):
            if shown >= a.show:
                break
            indent = re.match( r"^\s*", texts[ path ][ first ] ).group( 0 )
            print( "----- %s:%d  %s" % ( os.path.relpath( path, ROOT ), first + 1, m[ "qualified" ] ) )
            print( "\n".join( texts[ path ][ first:last + 1 ] ) )
            print( "  =>" )
            print( "\n".join( render( model, indent ) + code ) )
            shown += 1
    if a.apply:
        print( "files written: %d" % apply( blocks, texts ) )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
