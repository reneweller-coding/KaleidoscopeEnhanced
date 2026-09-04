#!/usr/bin/env python3
"""shadercheck.py -- static contract check for Kaleidoscope shaders.

Every rule here exists because the bug it catches ALREADY SHIPPED at least
once and cost a full render-and-eyeball cycle to find.  They are all silent
failures: the shader compiles (or fails to, invisibly) and renders solid
black, with nothing in the log to say why.  The point of this file is that
the machine finds them in a second instead of a human finding them in an hour.

Usage:
    python Tools/shadercheck.py                 # check everything
    python Tools/shadercheck.py --new <ref>     # only files added since <ref>
                                                # e.g. --new HEAD~1
Exit code 0 = clean, 1 = at least one ERROR.
"""
import argparse, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOMPLETT = os.path.join(ROOT, "Presets", "Komplett.xml")

# Host-provided uniforms.  Kept in sync with the kAudioLocs table in
# Source/EffectShader.cpp -- anything a shader uses that is NOT declared and
# NOT in here is simply an undeclared identifier, i.e. a compile error.
HOST_UNIFORMS = set("""
resolution time interpolation tex0 tex1 transStyle projM eyeOff sceneSeed
cubeBudget maxVertices oitPass nearFar shadowPass shadowExtent lightDir
lightM texShadow shadowTexel dayPhase frameIndex genPass
texSim texFluid texSmoke3D texSSM texPhysarum texSpectro
ssmHead ssmFill spectroHead spectroFill
""".split())

def sh(*a):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True).stdout

def strip_comments(src):
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', src)

def load_registry():
    """basename -> (type, geom) from Komplett.xml (the exhaustive reference)."""
    reg = {}
    if not os.path.exists(KOMPLETT):
        return reg
    xml = open(KOMPLETT, encoding="utf-8").read()
    for m in re.finditer(r'<TextureShader\s+file="([^"]+)"\s+type="([^"]+)"([^>]*)>', xml):
        base = os.path.basename(m.group(1).replace("\\\\", "\\").replace("\\", "/"))
        g = re.search(r'geom="([^"]*)"', m.group(3))
        reg[base] = (m.group(2), g.group(1) if g else "")
    return reg

def declared_names(body):
    """Identifiers a GLSL file defines itself: uniforms, in/out, locals,
    functions, struct names, buffer-block members."""
    d = set()
    d |= set(re.findall(r'\buniform\s+\w+\s+(\w+)', body))
    d |= set(re.findall(r'\b(?:in|out|attribute|varying)\s+\w+\s+(\w+)', body))
    d |= set(re.findall(r'\b(?:float|int|uint|bool|double|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)\s+(\w+)\s*[=;,)\[]', body))
    d |= set(re.findall(r'\bstruct\s+(\w+)', body))
    d |= set(re.findall(r'\b(\w+)\s*\([^;{)]*\)\s*\{', body))     # function defs
    for blk in re.findall(r'buffer\s+\w+\s*\{([^}]*)\}', body, re.S):
        d |= set(re.findall(r'(\w+)\s*(?:\[|;)', blk))
    d |= set(re.findall(r'\bconst\s+\w+\s+(\w+)', body))
    return d

def check(paths, reg):
    errors, warnings = [], []
    def err(f, msg):  errors.append((f, msg))
    def warn(f, msg): warnings.append((f, msg))

    for path in sorted(paths):
        rel  = os.path.relpath(path, ROOT).replace("\\", "/")
        name = os.path.basename(path)
        stem, ext = os.path.splitext(name)
        try:
            src = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        body = strip_comments(src)
        in3d = rel.startswith("Scene3D/")
        typ, geom = reg.get(stem + ".frag", (None, None))

        # --- R1 registration + pairing ------------------------------------
        if ext == ".frag" and (rel.startswith("Scene2D/") or in3d):
            if stem + ".frag" not in reg:
                err(rel, "not registered in Komplett.xml (scene can never be selected)")
            if in3d and not os.path.exists(os.path.join(ROOT, "Scene3D", stem + ".vert")):
                err(rel, "scene3d .frag without a matching .vert (loader requires both)")

        # --- R2 undeclared host uniforms (silent compile error -> black) ---
        used = set(re.findall(r'\b(audio[A-Za-z0-9_]*|tex[A-Z]\w*|time|resolution|'
                              r'interpolation|dayPhase|transStyle|oitPass|nearFar|projM|'
                              r'eyeOff|sceneSeed|cubeBudget|maxVertices|spectroHead|'
                              r'spectroFill|ssmHead|ssmFill)\b', body))
        decl = declared_names(body)
        for u in sorted(used - decl):
            if u == "texture":            # the GLSL builtin, not a sampler
                continue
            err(rel, f"uses '{u}' but never declares it (undeclared identifier = "
                     f"compile error, renders black with an empty log)")

        # --- R11 anti-flicker: never scale absolute time by an audio value --
        # Only a DIRECT multiplicative chain counts: "time * 0.4 * audioLevel".
        # "time * 0.4 + audioAdvance * 0.2" is the correct idiom, so the span
        # must not cross a + or - (that was a 128-false-positive regex once),
        # nor a ',' -- "vec2(time * 0.05, audioPhase * 0.1)" is two SEPARATE
        # function arguments, not a product, and the comma-less exclusion set
        # let the scan run straight through it (found once this rule was
        # moved to actually run against Scene2D files, below).
        # Applies to every shader stage, 2D or 3D -- previously lived below
        # the "in3d only" guard and so never actually ran against a single
        # Scene2D file; moved up here to close that gap.
        for m in re.finditer(r'\btime\s*\*[^;+\-,)\n]*\baudio\w+', body):
            warn(rel, "multiplies absolute 'time' by an audio-varying value -- the phase "
                      "jumps whenever the level changes (flicker). Integrate the rate "
                      "into a phase instead (audioAdvance) and add, don't multiply")

        # --- R14 self-referential trajectory/attractor seed -----------------
        # Seeding an integrated ODE/orbit trajectory FROM the same
        # screen-position variable later used to measure distance-to-it makes
        # that distance trivially ~0 at the very first step for EVERY pixel
        # (it starts equal to itself by construction) -- a flat wash instead
        # of a glowing curve. (Found across 4 attractor visualizers in the
        # 2026-08-20 batch, all Scene2D fragment shaders: pAiz = vec3(pRot.x,
        # pRot.y, ...) then later length(pRot - pAiz.xy).)
        for m in re.finditer(r'\b(\w+)\s*=\s*vec[23]\s*\(\s*(\w+)\.x\s*,\s*\2\.y\b', body):
            trajVar, screenVar = m.group(1), m.group(2)
            if trajVar == screenVar:
                continue
            tail = body[m.end():]
            if re.search(rf'\b{screenVar}\s*-\s*{trajVar}(?:\.xy)?\b', tail) \
               or re.search(rf'\b{trajVar}(?:\.xy)?\s*-\s*{screenVar}\b', tail):
                warn(rel, f"seeds '{trajVar}' from the screen-position variable "
                          f"'{screenVar}' and later appears to measure distance "
                          f"between them -- that distance starts at ~0 for EVERY "
                          f"pixel by construction, washing the whole frame to a "
                          f"near-uniform glow instead of tracing a real curve. "
                          f"Seed the trajectory from a FIXED point shared by all "
                          f"pixels instead")

        # --- R15 camera possibly embedded in its own track/curve geometry ---
        # A ray origin computed by calling the SAME parametric function used
        # again later to find "the nearest point on the track" is suspicious:
        # if the camera literally sits ON that curve, the very first raymarch
        # step (p = ro, totDist = 0) trivially satisfies "distance to track <
        # threshold" for every pixel regardless of ray direction -- an
        # instant, uniform hit instead of a tube flying past. (Found across 2
        # roller-coaster/knot-flight scenes in the 2026-08-20 batch, both
        # Scene2D fragment shaders.) Lower confidence than the other rules --
        # an offset combined in the same statement (ro = curve(...) +
        # right*off) is NOT the bug and is excluded, but a camera
        # legitimately allowed to ride the curve via some other safeguard
        # would still false-positive here.
        m_ro = re.search(r'\bvec3\s+ro\s*=\s*(\w+)\s*\(([^;]*)\)\s*;', body)
        if m_ro:
            trackFunc = m_ro.group(1)
            combined_offset = re.search(r'[+\-]\s*\w', body[m_ro.start():m_ro.end()])
            # Only the second call ACTUALLY INSIDE a later for-loop counts --
            # a call between ro's assignment and the loop (e.g. computing a
            # look-at target for fdir/rd) is normal camera setup, not this bug.
            m_for = re.search(r'\bfor\s*\(', body[m_ro.end():])
            loop_body = body[m_ro.end() + m_for.end():] if m_for else ""
            if not combined_offset and trackFunc not in ("vec3", "normalize", "mix", "clamp") \
               and re.search(rf'\b{trackFunc}\s*\(', loop_body):
                warn(rel, f"ray origin 'ro' is exactly {trackFunc}(...) with no "
                          f"offset applied, and the same function is called "
                          f"again inside a raymarch loop to find the nearest "
                          f"track point -- if the camera sits ON that curve, "
                          f"the first raymarch step hits instantly for every "
                          f"pixel. Verify the camera is actually offset off "
                          f"the curve (chase-cam pull-back/lateral shift)")

        # --- R11 a hit flag that is read but never set --------------------
        # `bool hit = false;` guarding `hit ? surface : background` is the
        # standard ray-march ending.  Forget the one `hit = true` inside the
        # loop and the branch is a constant: the surface is computed, then
        # thrown away, and every pixel takes the background.  It compiles, it
        # renders, and it looks like a scene that merely lost its geometry --
        # which is exactly how it shipped once, as flat sheets of colour.
        for m in re.finditer(r'\bbool\s+(\w+)\s*=\s*false\s*;', body):
            var  = m.group(1)
            rest = body[m.end():]
            if not re.search(r'\b%s\b' % re.escape(var), rest):
                continue                                   # unused: harmless
            if not re.search(r'\b%s\s*=\s*(?!=)' % re.escape(var), rest):
                err(rel, f"'bool {var}' is read but never assigned -- every branch on "
                         f"it takes the false side, so whatever it was meant to select "
                         f"can never appear")

        # --- rules below only apply to the scene3d vertex/compute stages ---
        if not in3d:
            continue

        if ext == ".vert":
            # A .vert that feeds a tessellation or geometry stage is a
            # pass-through: the DOWNSTREAM stage does the projection, so the
            # camera/attribute rules below do not apply to it.
            passthrough = any(os.path.exists(os.path.join(ROOT, "Scene3D", stem + e))
                              for e in (".tese", ".geom"))

            # --- R3 vertex attribute convention ---------------------------
            # Only a problem if the generic name is actually USED: several
            # scenes declare inPos/inNormal, never read them, and derive
            # everything from gl_VertexID -- harmless.
            generic = [g for g in ("inPos", "inNormal", "inTexCoord")
                       if re.search(rf'\bin\s+vec[234]\s+{g}\b', body)
                       and len(re.findall(rf'\b{g}\b', body)) > 1]
            if generic:
                err(rel, f"reads {', '.join(generic)} -- Scene3DShader only binds "
                         f"attrA/attrB (glGetAttribLocation), so these get no data; "
                         f"the geometry collapses to zero and renders black")
            elif not re.search(r'\bin\s+vec4\s+attrA\b', body) \
                 and "gl_VertexID" not in body and not passthrough:
                warn(rel, "declares neither attrA nor uses gl_VertexID -- check where "
                          "its per-vertex data is meant to come from")

            # --- R4 gl_InstanceID is only meaningful under instances="N" ---
            # Instanced drawing exists for geom="mesh" since Fleet: the scene
            # entry carries instances="N", Scene3DShader switches to
            # glDrawArraysInstanced, and the shader reads meshInstances. Any
            # OTHER shader touching gl_InstanceID still gets a constant 0.
            if "gl_InstanceID" in body and "meshInstances" not in body:
                err(rel, "uses gl_InstanceID without declaring meshInstances -- "
                         "outside an instances=\"N\" mesh scene the engine draws "
                         "non-instanced and it is always 0; the per-unit index "
                         "is in attrA.w")

            # --- R5 per-unit index lives in attrA.w, not attrB -------------
            if re.search(r'int\s*\(\s*attrB\.[xyz]\s*\)', body):
                err(rel, "reads an index from attrB.xyz, but attrB carries hash01 "
                         "seeds in [0,1) -- int() of it is always 0; the index is attrA.w")

            # --- R6 camera transform --------------------------------------
            if "gl_Position" in body and not passthrough:
                ok = re.search(r'projM\s*\*\s*vec4\([^)]*-\s*\w+(\.\w+)?\s*,\s*1\.0\s*\)', body)
                if not ok:
                    err(rel, "gl_Position does not negate view-space z. projM has -1 in "
                             "its w row (clip-w = -z_view), so geometry is only visible "
                             "for NEGATIVE z past the near plane. Use: vp.z += <dist>; "
                             "gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);")

            # --- R12 geom="patches" requires a .tesc/.tese pair -----------
            # GL_PATCHES only reaches the fragment stage through a
            # tessellation control+evaluation pair; without both, the
            # driver has no tessellation levels to work from and the
            # patch draws NOTHING -- solid black, zero diagnostic output.
            # (Found by hand across 9 scenes in the 2026-08-19 batch, all
            # of which actually wanted geom="grid" -- their vert already
            # read attrA.xy as a dense per-vertex UV, not four patch
            # corners.)
            if geom == "patches":
                have_tesc = os.path.exists(os.path.join(ROOT, "Scene3D", stem + ".tesc"))
                have_tese = os.path.exists(os.path.join(ROOT, "Scene3D", stem + ".tese"))
                if not (have_tesc and have_tese):
                    missing = ", ".join(e for e, have in
                                         ((".tesc", have_tesc), (".tese", have_tese)) if not have)
                    err(rel, f"geom=\"patches\" but Scene3D/{stem} is missing {missing} -- "
                             f"GL_PATCHES needs both stages to tessellate; without them "
                             f"nothing is drawn. If this scene's attrA is really a dense "
                             f"per-vertex UV (not four patch corners), the fix is "
                             f"geom=\"grid\" in Komplett.xml, not writing a tesc/tese pair")

            # --- R13 time-driven rotation must precede the camera translate
            # A `cos(t*k)`/`sin(t*k)` spin applied to vp AFTER `vp.z += dist`
            # rotates the whole scene around the CAMERA (radius = dist),
            # not around its own centre -- it spends most of the cycle
            # outside the frustum. (Found across 27 verts in the
            # 2026-08-19 batch: every one read "// 3D rotation" / "Smooth
            # rotation in 3D" as intent, but applied it post-translate.)
            # A FIXED angle (e.g. "float tilt = 0.55;") applied after the
            # translate is deliberate framing, not this bug, and is not
            # flagged.
            m_translate = re.search(r'vp\.z\s*\+=', body)
            if m_translate:
                tail = body[m_translate.end():]
                m_rot = re.search(r'cos\s*\([^()]*\b(?:t|time)\b[^()]*\)', tail)
                if m_rot and re.search(r'\bvp\s*=\s*vec3\s*\(', tail[m_rot.end():m_rot.end() + 400]):
                    err(rel, "rotates vp by a TIME-driven angle after 'vp.z += ...' -- this "
                             "orbits the whole scene around the camera (radius = the z "
                             "offset) instead of spinning it in place. Move the rotation "
                             "before the translate: rotate vp, THEN vp.z += dist")

            # --- R7 grid/quads attrA.xy domain is [0,1], not [-1,1] -------
            # A bare "xUV = attrA.xy;" straight to a texcoord-shaped varying is
            # the common, correct case (fragment stage wants [0,1]) -- only
            # worth flagging when the raw value feeds something that is NOT a
            # uv/texcoord passthrough (e.g. a "corner" used for position math).
            m_direct = re.search(r'(\w+)\s*=\s*attrA\.xy\s*;', body)
            if geom in ("grid", "quads") and m_direct \
                    and not re.search(r'(?i)uv|texcoord', m_direct.group(1)):
                # Any of the accepted re-centring idioms is fine:
                #   attrA.xy * 2.0 - 1.0   |   attrA.xy - 0.5   |   uv - vec2(0.5)
                recentred = (re.search(r'attrA\.xy\s*\*\s*2\.0\s*-\s*1\.0', body)
                             or re.search(r'attrA\.xy\s*-\s*0?\.5', body)
                             or re.search(r'\w+\.(?:xy|[xy])\s*-\s*0\.5', body)
                             or re.search(r'\w+\s*-\s*vec2\s*\(\s*0?\.5', body))
                if not recentred:
                    warn(rel, f"geom=\"{geom}\" supplies attrA.xy in [0,1]; this file uses "
                              f"it directly. If the math assumes a centred [-1,1] domain "
                              f"the scene lands in one quadrant (remap: attrA.xy*2.0-1.0)")

        if ext == ".frag":
            # --- R8 gl_PointCoord only exists for GL_POINTS ---------------
            if "gl_PointCoord" in body and geom not in (None, "points", "scatter"):
                err(rel, f"uses gl_PointCoord but geom=\"{geom}\" draws GL_TRIANGLES -- "
                         f"gl_PointCoord is undefined there (reads 0,0), so a radial "
                         f"'if (r > 1) discard' throws away every fragment")

        if ext == ".comp":
            # --- R9 the indirect draw-count contract ----------------------
            writes_cmd0 = re.search(r'\bcmd\s*\[\s*0\s*\]\s*=', body)
            uses_atomic = re.search(r'atomicAdd\s*\(\s*cmd\s*\[\s*4\s*\]', body)
            if writes_cmd0:
                err(rel, "writes cmd[0] directly. Engine/IndirectClamp.comp runs after "
                         "every generator and does cmd[0] = min(cmd[4], maxVertices), "
                         "so this count is overwritten with 0 and nothing draws. "
                         "Publish the count via atomicAdd(cmd[4], n) instead")
            if not uses_atomic:
                warn(rel, "no atomicAdd(cmd[4], n) -- an indirect generator must reserve "
                          "its vertices that way for the clamp pass to publish a count")
            if re.search(r'uint\s+cmd\s*\[\s*4\s*\]', body):
                err(rel, "declares 'uint cmd[4]' -- slot 4 is the reservation counter, "
                         "so the array must be unsized: buffer Cmd { uint cmd[]; }")
            if not re.search(r'uniform\s+uint\s+maxVertices', body):
                warn(rel, "does not take 'uniform uint maxVertices' -- without the bound "
                          "check a generator can overrun the vertex buffer")
            # --- R10 dispatch is 16x16x16 of 4x4x4: flatten all three axes --
            ls = re.search(r'local_size_x\s*=\s*(\d+).*?local_size_y\s*=\s*(\d+).*?'
                           r'local_size_z\s*=\s*(\d+)', body, re.S)
            if ls and ls.groups() != ("4", "4", "4"):
                warn(rel, f"local_size is {ls.groups()}; the host always dispatches "
                          f"16x16x16, so 4x4x4 (=64^3 invocations) is the layout the "
                          f"index math in every other generator assumes")
            if re.search(r'gl_GlobalInvocationID\.x\s*;', body) and \
               not re.search(r'gl_GlobalInvocationID\.[yz]', body):
                warn(rel, "indexes by gl_GlobalInvocationID.x only. With a 3D dispatch "
                          "that covers just 1/4096 of the invocations -- flatten all "
                          "three: g.x + 64u*(g.y + 64u*g.z)")

    return errors, warnings

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", metavar="GITREF",
                    help="only check shader files added/changed since this ref")
    a = ap.parse_args()

    if a.new:
        out = sh("git", "diff", "--name-only", "--diff-filter=AM", a.new, "HEAD")
        files = [os.path.join(ROOT, p) for p in out.split()
                 if p.endswith((".frag", ".vert", ".comp"))]
    else:
        files = []
        for d in ("Scene2D", "Scene3D", "FX", "Engine", "Transitions"):
            dp = os.path.join(ROOT, d)
            if not os.path.isdir(dp):
                continue
            files += [os.path.join(dp, f) for f in os.listdir(dp)
                      if f.endswith((".frag", ".vert", ".comp"))]

    if not files:
        print("shadercheck: no shader files to check"); return 0

    errors, warnings = check(files, load_registry())
    for f, m in warnings: print(f"WARN  {f}\n      {m}")
    if warnings and errors: print()
    for f, m in errors:    print(f"ERROR {f}\n      {m}")
    print(f"\nshadercheck: {len(files)} file(s), {len(errors)} error(s), "
          f"{len(warnings)} warning(s)")
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main())
