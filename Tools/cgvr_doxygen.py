# -*- coding: utf-8 -*-
"""Runs Doxygen the way the CGVR guidelines are checked here, and reads its XML for the comment tools.

The run uses the repository's Doxyfile with EXTRACT_ALL=NO and WARN_NO_PARAMDOC=YES, so every undocumented
entity, parameter and return value is a warning, and writes the XML that `members()` reads: per function its
file and line, parameters (type, name), return type and the documented parameter names.

Usage:
    python Tools/cgvr_doxygen.py                 # warnings per area and kind
    python Tools/cgvr_doxygen.py --missing       # C++ functions with undocumented parameters or return value
"""
import argparse
import collections
import glob
import io
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname( os.path.dirname( os.path.abspath( __file__ ) ) )
DOXYGEN = r"C:\Program Files\doxygen\bin\doxygen.exe"
CPP = re.compile( r"(^|[\\/])(Source|PresetEditor|SetupTool)[\\/]" )


def run( out_dir=None ):
    """Runs Doxygen; returns (output directory, warning lines)."""
    out_dir = out_dir or tempfile.mkdtemp( prefix="cgvr_dox_" )
    os.makedirs( out_dir, exist_ok=True )
    cfg = io.open( os.path.join( ROOT, "Doxyfile" ), encoding="utf-8", errors="replace" ).read()
    cfg += ( "\nOUTPUT_DIRECTORY = %s\nGENERATE_HTML = NO\nGENERATE_LATEX = NO\nGENERATE_XML = YES\n"
             "XML_PROGRAMLISTING = NO\nQUIET = YES\nEXTRACT_ALL = NO\nEXTRACT_PRIVATE = YES\nEXTRACT_STATIC = YES\n"
             "WARN_NO_PARAMDOC = YES\nWARN_LOGFILE = %s/warn.txt\n" % ( out_dir.replace( "\\", "/" ), out_dir.replace( "\\", "/" ) ) )
    with io.open( os.path.join( out_dir, "Doxyfile" ), "w", encoding="utf-8" ) as fh:
        fh.write( cfg )
    subprocess.run( [ DOXYGEN, os.path.join( out_dir, "Doxyfile" ) ], cwd=ROOT, capture_output=True, timeout=3600 )
    warn = io.open( os.path.join( out_dir, "warn.txt" ), encoding="utf-8", errors="replace" ).read().splitlines()
    return out_dir, warn


def text( node ):
    return "".join( node.itertext() ).strip() if node is not None else ""


def members( out_dir, only_cpp=True ):
    """Function members from the XML: dicts with file, line, name, params [(type, name)], type, documented params,
    has_return_doc, brief, kind."""
    seen, out = set(), []
    for x in glob.glob( os.path.join( out_dir, "xml", "*.xml" ) ):
        try:
            root = ET.parse( x ).getroot()
        except ET.ParseError:
            continue
        for md in root.iter( "memberdef" ):
            if md.get( "kind" ) not in ( "function", "slot", "signal" ):
                continue
            loc = md.find( "location" )
            if loc is None:
                continue
            f = loc.get( "file", "" )
            if only_cpp and not CPP.search( f ):
                continue
            key = ( md.get( "id" ) )
            if key in seen:
                continue
            seen.add( key )
            params = [ ( text( p.find( "type" ) ), text( p.find( "declname" ) ) ) for p in md.findall( "param" ) ]
            documented = set()
            for pl in md.iter( "parameterlist" ):
                if pl.get( "kind" ) == "param":
                    for item in pl.findall( "parameteritem" ):
                        for n in item.iter( "parametername" ):
                            documented.add( text( n ) )
            has_ret = any( s.get( "kind" ) == "return" for s in md.iter( "simplesect" ) )
            out.append( { "file": f, "line": int( loc.get( "line", "0" ) ), "bodyfile": loc.get( "bodyfile", "" ),
                          "bodystart": int( loc.get( "bodystart", "0" ) or 0 ), "name": text( md.find( "name" ) ),
                          "qualified": text( md.find( "qualifiedname" ) ) or text( md.find( "name" ) ),
                          "type": text( md.find( "type" ) ),
                          "params": params, "documented": documented, "has_return_doc": has_ret,
                          "brief": text( md.find( "briefdescription" ) ), "argsstring": text( md.find( "argsstring" ) ) } )
    return out


def missing( ms ):
    """The members whose parameters or return value lack a description."""
    out = []
    for m in ms:
        need_ret = m[ "type" ] not in ( "", "void" ) and not m[ "type" ].startswith( ( "explicit", "virtual void", "static void", "inline void" ) ) \
            and not m[ "name" ].startswith( "~" ) and m[ "name" ] != m[ "qualified" ].split( "::" )[ -2 if "::" in m[ "qualified" ] else 0 ]
        undocumented = [ n for t, n in m[ "params" ] if n and n not in m[ "documented" ] ]
        if undocumented or ( need_ret and not m[ "has_return_doc" ] ):
            out.append( ( m, undocumented, need_ret and not m[ "has_return_doc" ] ) )
    return out


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--missing", action="store_true" )
    ap.add_argument( "--out", help="keep the Doxygen output here" )
    a = ap.parse_args()
    out_dir, warn = run( a.out )
    kinds = collections.Counter()
    for l in warn:
        m = re.match( r"(.+?):(\d+): warning: (.*)", l )
        if m:
            area = "C++" if CPP.search( m.group( 1 ) ) else "GLSL"
            kinds[ ( area, re.sub( r"member \S+|'[^']*'", "X", m.group( 3 ) )[ :70 ] ) ] += 1
    for ( area, k ), n in kinds.most_common( 20 ):
        print( "%6d  %-4s  %s" % ( n, area, k ) )
    if a.missing:
        for m, und, ret in missing( members( out_dir ) ):
            print( "%s:%d  %s %s%s" % ( os.path.relpath( m[ "file" ], ROOT ) if os.path.isabs( m[ "file" ] ) else m[ "file" ], m[ "line" ],
                                        m[ "type" ], m[ "qualified" ], m[ "argsstring" ] ) )
            print( "      brief: %s" % m[ "brief" ][ :150 ] )
            print( "      missing: %s%s" % ( ", ".join( und ), "  + return" if ret else "" ) )
    return 0


if __name__ == "__main__":
    sys.exit( main() )
