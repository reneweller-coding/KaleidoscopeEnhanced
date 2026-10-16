# -*- coding: utf-8 -*-
"""Runs clang-tidy over the C++ of the app, the preset editor and the setup tool, for the CGVR guidelines.

The compile database is built from the three .vcxproj files (Release|x64: defines, include paths, C++17), the
MSVC and Windows SDK headers come from vcvars64.bat.  Every translation unit runs in its own process; the fixes
each one exports are merged here -- a header's rename arrives from every unit that includes it, so identical
replacements are applied once, and two different edits of the same bytes are reported and none of them applied.

Usage:
    python Tools/cgvr_tidy.py --report              # diagnostics per check and per kind, change nothing
    python Tools/cgvr_tidy.py --report --list N     # ... and the first N diagnostics of each kind
    python Tools/cgvr_tidy.py --fix                 # apply the merged fixes
    python Tools/cgvr_tidy.py --checks <glob>       # override the check list of .clang-tidy
"""
import argparse
import collections
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import tempfile

import yaml

ROOT = os.path.dirname( os.path.dirname( os.path.abspath( __file__ ) ) )
QTDIR = os.environ.get( "QTDIR", r"C:\Qt\6.11.1\msvc2022_64" )
VS = r"C:\Program Files\Microsoft Visual Studio\18\Community"
CLANG_TIDY = os.path.join( VS, r"VC\Tools\Llvm\x64\bin\clang-tidy.exe" )
VCVARS = os.path.join( VS, r"VC\Auxiliary\Build\vcvars64.bat" )
DB_DIR = os.path.join( ROOT, "cache", "clang-tidy" )
PROJECTS = ( "Kaleidoscope.vcxproj", r"PresetEditor\PresetEditor.vcxproj", r"SetupTool\SetupTool.vcxproj" )
OURS = re.compile( r"[\\/](Source|PresetEditor|SetupTool)[\\/][^\\/]+\.(cpp|h|c|hh)$", re.I )


def msvc_env():
    """The environment vcvars64.bat sets up (INCLUDE, LIB, PATH), so clang-cl finds the STL and the SDK."""
    out = subprocess.run( 'cmd /c ""%s" >nul && set"' % VCVARS, capture_output=True, text=True, shell=True ).stdout
    env = dict( os.environ )
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split( "=", 1 )
            env[ k ] = v
    return env


def project_units( vcxproj ):
    """(translation units, compiler arguments) of one project's Release|x64 configuration."""
    path = os.path.join( ROOT, vcxproj )
    projdir = os.path.dirname( path ) + os.sep
    text = open( path, encoding="utf-8-sig" ).read()
    group = re.search( r"<ItemDefinitionGroup Condition=\"[^\"]*Release\|x64[^\"]*\">(.*?)</ItemDefinitionGroup>", text, re.S ).group( 1 )

    def field( name ):
        m = re.search( r"<%s>(.*?)</%s>" % ( name, name ), group, re.S )
        return m.group( 1 ) if m else ""

    def expand( s ):
        return s.replace( "$(ProjectDir)", projdir ).replace( "$(QTDIR)", QTDIR ).replace( "$(SolutionDir)", ROOT + os.sep )

    defines = [ d for d in expand( field( "PreprocessorDefinitions" ) ).split( ";" ) if d and not d.startswith( "%(" ) ]
    includes = [ i for i in expand( field( "AdditionalIncludeDirectories" ) ).split( ";" ) if i and not i.startswith( "%(" ) ]
    args = [ "clang-cl.exe", "/std:c++17", "/Zc:__cplusplus", "/permissive-", "/EHsc", "/utf-8", "/D_MBCS",
             "-Wno-everything", "/DQT_CORE_LIB", "/DQT_GUI_LIB", "/DQT_WIDGETS_LIB",
             "/D_XM_NO_INTRINSICS_" ]   # DirectXMath wants clang's cpuid.h, which Visual Studio's LLVM lacks
    args += [ "/D" + d for d in defines ] + [ "/I" + os.path.normpath( i ) for i in includes ]
    units = []
    for m in re.finditer( r"<ClCompile Include=\"([^\"]+)\"", text ):
        f = os.path.normpath( os.path.join( projdir, expand( m.group( 1 ) ) ) )
        if OURS.search( f ) and not os.path.basename( f ).startswith( ( "moc_", "qrc_", "ui_" ) ):
            units.append( f )
    return units, args


# Built by CMakeLists.txt only (the Linux/macOS port), analysed with the app's flags.
EXTRA_UNITS = ( r"Source\Platform.cpp", )
# C++/WinRT needs coroutines, which clang accepts only from C++20 on (MSVC builds the file as C++17).
STD_OVERRIDE = { "nowplaying.cpp": "/std:c++20" }


def write_db():
    """Writes cache/clang-tidy/compile_commands.json; returns the list of translation units."""
    entries, seen = [], set()
    for p in PROJECTS:
        units, args = project_units( p )
        if p == PROJECTS[ 0 ]:
            units = units + [ os.path.join( ROOT, u ) for u in EXTRA_UNITS ]
        for f in units:
            if f.lower() in seen:                    # Source/*.cpp shared by the editor: the app's flags win
                continue
            seen.add( f.lower() )
            std = STD_OVERRIDE.get( os.path.basename( f ).lower() )
            unit_args = [ std if a.startswith( "/std:" ) and std else a for a in args ]
            entries.append( { "directory": os.path.dirname( os.path.join( ROOT, p ) ), "file": f,
                              "arguments": unit_args + [ "/c", f ] } )
    os.makedirs( DB_DIR, exist_ok=True )
    with open( os.path.join( DB_DIR, "compile_commands.json" ), "w", encoding="utf-8" ) as fh:
        json.dump( entries, fh, indent=1 )
    return [ e[ "file" ] for e in entries ]


def run_unit( unit, env, fixes_dir, checks ):
    """clang-tidy on one unit; returns (unit, diagnostics text, path of the exported fixes or None)."""
    out = os.path.join( fixes_dir, "%08x.yaml" % ( hash( unit ) & 0xffffffff ) )
    cmd = [ CLANG_TIDY, "-p", DB_DIR, "--config-file=" + os.path.join( ROOT, ".clang-tidy" ),
            "--header-filter=.*[\\\\/](Source|PresetEditor|SetupTool)[\\\\/].*", "--export-fixes=" + out, "--quiet" ]
    if checks:
        cmd.append( "--checks=-*," + checks )
    cmd.append( unit )
    r = subprocess.run( cmd, capture_output=True, text=True, env=env, encoding="utf-8", errors="replace" )
    return unit, r.stdout + r.stderr, out if os.path.exists( out ) else None


DIAG = re.compile( r"^(?P<file>[A-Za-z]:[^:]+):(?P<line>\d+):(?P<col>\d+): (?P<sev>warning|error): (?P<msg>.*?) \[(?P<check>[^\]]+)\]$", re.M )


def merge_fixes( paths ):
    """{file: [(offset, length, text)]} from the exported yaml files.

    A diagnostic in a header arrives once from every unit that includes it: diagnostics are taken once each (by
    check, place and message), their edits all.  Two different diagnostics may both insert at one place -- the
    closing parentheses of nested casts -- so equal edits of different diagnostics are not merged.  Edits that
    overlap a replaced range are conflicts and are left out.
    """
    diags = {}
    for p in paths:
        with open( p, encoding="utf-8" ) as fh:
            data = yaml.safe_load( fh ) or {}
        for d in data.get( "Diagnostics", [] ):
            msg = d.get( "DiagnosticMessage", {} )
            key = ( d.get( "DiagnosticName" ), os.path.normcase( os.path.normpath( msg.get( "FilePath", "" ) ) ),
                    msg.get( "FileOffset" ), msg.get( "Message" ) )
            diags[ key ] = [ ( os.path.normcase( os.path.normpath( r[ "FilePath" ] ) ), r[ "Offset" ], r[ "Length" ],
                               r[ "ReplacementText" ] ) for r in msg.get( "Replacements", [] ) or [] ]
    edits = collections.defaultdict( list )
    for reps in diags.values():
        for f, off, ln, txt in reps:
            edits[ f ].append( ( off, ln, txt ) )
    merged, conflicts = {}, []
    for f, es in edits.items():
        if not OURS.search( f ):
            continue
        keep = []
        for e in sorted( es ):
            if keep and e[ 0 ] < keep[ -1 ][ 0 ] + keep[ -1 ][ 1 ]:
                conflicts.append( ( f, keep[ -1 ], e ) )
                continue
            keep.append( e )
        merged[ f ] = keep
    return merged, conflicts


def apply( merged ):
    """Applies byte-offset replacements, last first, keeping each file's bytes otherwise untouched."""
    for f, es in merged.items():
        data = open( f, "rb" ).read()
        for off, ln, txt in sorted( es, reverse=True ):
            data = data[ :off ] + txt.encode( "utf-8" ) + data[ off + ln: ]
        open( f, "wb" ).write( data )


def main():
    ap = argparse.ArgumentParser( description=__doc__.split( "\n" )[ 0 ] )
    ap.add_argument( "--report", action="store_true" )
    ap.add_argument( "--fix", action="store_true" )
    ap.add_argument( "--list", type=int, default=0 )
    ap.add_argument( "--checks", default="" )
    ap.add_argument( "--jobs", type=int, default=12 )
    ap.add_argument( "--only", nargs="*", help="only these translation units (file names)" )
    a = ap.parse_args()
    units = write_db()
    if a.only:
        units = [ u for u in units if os.path.basename( u ) in a.only ]
    env = msvc_env()
    fixes_dir = tempfile.mkdtemp( prefix="cgvr_tidy_" )
    diags, errors, fix_files = {}, [], []
    with concurrent.futures.ThreadPoolExecutor( a.jobs ) as ex:
        for unit, text, fx in ex.map( lambda u: run_unit( u, env, fixes_dir, a.checks ), units ):
            if fx:
                fix_files.append( fx )
            for m in DIAG.finditer( text ):
                key = ( os.path.normcase( m.group( "file" ) ), int( m.group( "line" ) ), int( m.group( "col" ) ), m.group( "msg" ) )
                if m.group( "sev" ) == "error" and "clang-diagnostic" in m.group( "check" ):
                    errors.append( "%s:%s: %s" % ( m.group( "file" ), m.group( "line" ), m.group( "msg" ) ) )
                elif OURS.search( m.group( "file" ) ):
                    diags[ key ] = m.group( "check" )
    by_check = collections.Counter( diags.values() )
    kinds = collections.defaultdict( list )
    for ( f, ln, col, msg ), chk in sorted( diags.items() ):
        kind = re.sub( r"'[^']*'", "'..'", msg )
        kinds[ ( chk, kind ) ].append( "%s:%d: %s" % ( os.path.relpath( f, ROOT ), ln, msg ) )
    print( "units: %d  diagnostics: %d  parse errors: %d" % ( len( units ), len( diags ), len( errors ) ) )
    for e in errors[ :10 ]:
        print( "  PARSE", e[ :200 ] )
    for chk, n in by_check.most_common():
        print( "%6d  %s" % ( n, chk ) )
    if a.report:
        for ( chk, kind ), items in sorted( kinds.items(), key=lambda kv: -len( kv[ 1 ] ) ):
            print( "%6d  %-40s %s" % ( len( items ), chk[ :40 ], kind[ :110 ] ) )
            for it in items[ :a.list ]:
                print( "            " + it[ :200 ] )
    if a.fix:
        merged, conflicts = merge_fixes( fix_files )
        for f, x, y in conflicts:
            print( "CONFLICT %s: %r vs %r" % ( os.path.relpath( f, ROOT ), x, y ) )
        apply( merged )
        print( "applied %d edits in %d files, %d conflicts left out" % ( sum( len( v ) for v in merged.values() ), len( merged ), len( conflicts ) ) )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit( main() )
