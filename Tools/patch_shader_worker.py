# -*- coding: utf-8 -*-
"""Route the chain-lab variants through the compile worker (Source/ShaderWorker.*)
and start the worker with the main context."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def rw(path, pairs):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:60])
        s = s.replace(a, b)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

rw(os.path.join("Source", "shader_setup.cpp"), [
('#include "shader_setup.h"\n', '#include "shader_setup.h"\n#include "ShaderWorker.h"\n'),
("""bool shaderVariantStart( const char *frag_source, const std::string &defines )
{
	if( !parallelCompile() ) return false;
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) || s_variantFailed.count( key ) ) return true;
""",
"""static std::map<std::string, int> s_workerPending;   ///< variant keys queued on the compile worker

bool shaderVariantStart( const char *frag_source, const std::string &defines )
{
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) || s_variantFailed.count( key ) || s_workerPending.count( key ) )
		return true;
	const bool worker = shaderWorkerUsable();
	if( !worker && !parallelCompile() ) return false;
"""),
("""	text.insert( nl == std::string::npos ? text.size() : nl + 1, defines );
	PrebuildJob j;""",
"""	text.insert( nl == std::string::npos ? text.size() : nl + 1, defines );
	// The worker thread builds it start to finish: the driver's own background
	// compile still blocked ~0.8 s on the link-status query (ShaderWorker.h).
	if( worker )
	{
		shaderWorkerSubmit( key, text );
		s_workerPending[key] = 1;
		return true;
	}
	PrebuildJob j;"""),
("""GLuint shaderVariantTake( const char *frag_source, const std::string &defines )
{
	shaderPrebuildPoll();""",
"""GLuint shaderVariantTake( const char *frag_source, const std::string &defines )
{
	std::string k;
	GLuint built = 0;
	while( shaderWorkerCollect( k, built ) )
	{
		s_workerPending.erase( k );
		if( built ) progStore( k, built );
		else        s_variantFailed[k] = 1;
	}
	shaderPrebuildPoll();"""),
])

rw(os.path.join("Source", "glwidget.cpp"), [
("""	if( !glcoreInit() )
		fprintf( stderr, "FATAL: required OpenGL core functions missing\\n" );
""",
"""	if( !glcoreInit() )
		fprintf( stderr, "FATAL: required OpenGL core functions missing\\n" );
	// A thread with a shared context compiles the chain labs' specialised
	// variants, so their builds never stall the picture (ShaderWorker.h).
	shaderWorkerStart( context() );
"""),
])

p = os.path.join(ROOT, "Source", "glwidget.cpp")
s = io.open(p, encoding="utf-8", newline="").read()
if '#include "ShaderWorker.h"' not in s:
    nl = "\r\n" if "\r\n" in s else "\n"
    i = s.index('#include "glwidget.h"')
    j = s.index(nl, i) + len(nl)
    s = s[:j] + '#include "ShaderWorker.h"' + nl + s[j:]
    io.open(p, "w", encoding="utf-8", newline="").write(s)

for f in ("Kaleidoscope.vcxproj", "Kaleidoscope.vcxproj.filters"):
    p = os.path.join(ROOT, f)
    s = io.open(p, encoding="utf-8-sig", newline="").read()
    bom = io.open(p, "rb").read(3) == b"\xef\xbb\xbf"
    nl = "\r\n" if "\r\n" in s else "\n"
    if "ShaderWorker.cpp" not in s:
        if f.endswith(".filters"):
            a = '    <ClCompile Include="Source\\shader_setup.cpp">'
            i = s.index(a)
            blk_end = s.index("</ClCompile>", i) + len("</ClCompile>")
            blk = s[i:blk_end]
            s = s[:blk_end] + nl + blk.replace("shader_setup.cpp", "ShaderWorker.cpp") + s[blk_end:]
            a = '    <ClInclude Include="Source\\shader_setup.h">'
            i = s.index(a)
            blk_end = s.index("</ClInclude>", i) + len("</ClInclude>")
            blk = s[i:blk_end]
            s = s[:blk_end] + nl + blk.replace("shader_setup.h", "ShaderWorker.h") + s[blk_end:]
        else:
            s = s.replace('    <ClCompile Include="Source\\shader_setup.cpp" />',
                          '    <ClCompile Include="Source\\shader_setup.cpp" />' + nl + '    <ClCompile Include="Source\\ShaderWorker.cpp" />', 1)
            s = s.replace('    <ClInclude Include="Source\\shader_setup.h" />',
                          '    <ClInclude Include="Source\\shader_setup.h" />' + nl + '    <ClInclude Include="Source\\ShaderWorker.h" />', 1)
        io.open(p, "w", encoding="utf-8-sig" if bom else "utf-8", newline="").write(s)
print("ok")
