#version 330 core
/**
 * @file QuantumSpinLiquidKagomeSpinonLattice.vert
 * @brief Vertex stage companion to QuantumSpinLiquidKagomeSpinonLattice.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN FILL: the lattice used to be a small cube (39^3 cells at a 0.015..0.04
 * pitch = barely +-1.1 world units) stranded in the middle of a black frame at
 * a camera distance of 4.5, so it covered ~17% of the picture.  It is now a
 * WIDE SLAB of stacked kagome planes -- +-5.6 across, only +-1.6 deep -- that
 * overflows both frame edges at every depth it occupies, and it spins in-plane
 * (roll) instead of about the vertical, so the silhouette can never turn
 * edge-on and go narrow again.
 *
 * STRUCTURE: covering the frame is not the same as filling it.  Every sprite
 * used to be the same size and the same brightness whatever its depth, and the
 * one spatially varying term -- the spinon wave -- carried a per-point RANDOM
 * phase (seeds.x * 3.0, half a period), so neighbouring sites were uncorrelated
 * and the slab measured as an even dither with no light and no dark in it.  The
 * spinon field is now a COHERENT three-wave interference pattern, sites outside
 * its fronts fade out so the picture keeps real voids, and both size and
 * luminance now fall off with depth.
 */

in vec4 attrA; // xyz = position seed, w = pointID
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vSpinon;
out float vPointSize;
out float vLum;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float kagomePitchP;
uniform float pointSizeP;
uniform float spinonSpreadP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void park()
{
    vCol = vec3(0.0);
    vSpinon = 0.0;
    vLum = 0.0;
    vPointSize = 1.0;
    gl_PointSize = 1.0;
    gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}

void main()
{
    float pId = attrA.w;
    vec4 seeds = attrB;

    float t = time * 0.35 + audioAdvance * 0.3;

    const float nSide = 39.0;                 // 39^3 = 59319 of the 60000 points
    if (pId >= nSide * nSide * nSide) {
        // Leftover points of the host's fixed 60000-point buffer: park them
        // outside the clip volume rather than letting mod() stack duplicates
        // on top of the first layer.
        park();
        return;
    }

    float ix = mod(pId, nSide);
    float iy = mod(floor(pId / nSide), nSide);
    float iz = floor(pId / (nSide * nSide));

    // Kagome corner-sharing-triangle sub-lattice
    float triangleSub = mod(ix + iy + iz, 3.0);
    vec2 sub = (triangleSub == 0.0) ? vec2(0.0, 0.0)
             : ((triangleSub == 1.0) ? vec2(0.5, 0.0) : vec2(0.25, 0.433));

    // Cell -> normalised [-0.5, +0.5] lattice coordinates, then blown up to a
    // slab that is much wider than it is deep.
    vec3 unit = vec3((ix + sub.x) / nSide - 0.5,
                     (iy + sub.y) / nSide - 0.5,
                     (iz + 0.5)   / nSide - 0.5);

    // kagomePitchP still sets the lattice spacing, but as a RELATIVE scale of a
    // slab that always overflows the frame: even the tightest pitch keeps the
    // half-width at 4.6 against a 4.17 frame half-width.  The depth extent is
    // deliberately NOT scaled -- a deeper slab would push its near face through
    // the 0.5 near plane.
    float pitch  = (kagomePitchP > 0.01 ? kagomePitchP : 0.026);
    float pScale = 0.82 + 0.50 * clamp((pitch - 0.015) / 0.025, 0.0, 1.0);
    vec3  ext    = vec3(5.6 * pScale, 5.6 * pScale, 1.6);

    vec3 gridPos = unit * 2.0 * ext;

    // ---- COHERENT SPINON CONTINUUM -----------------------------------
    // Three interfering spinon plane waves at 120 degrees -- the emergent gauge
    // field of the resonating-valence-bond state.  Coherent is the whole point:
    // the old sin(r*k + seeds.x*3.0) randomised the phase PER SITE, which turned
    // the one structured term in the scene into per-point noise.  Their q
    // vectors are nearly in-plane, so the pattern survives being seen through
    // the depth of the slab instead of averaging out along the view axis.
    float kSpread = clamp((spinonSpreadP > 0.01 ? spinonSpreadP : 1.2), 0.6, 2.2);
    float kq = 6.5 * kSpread;
    const vec3 q1 = vec3( 1.0,  0.000,  0.160);
    const vec3 q2 = vec3(-0.5,  0.866, -0.160);
    const vec3 q3 = vec3(-0.5, -0.866,  0.272);
    float wv = sin(dot(gridPos, q1) * kq - t * 1.60 + audioPhase * 0.35)
             + sin(dot(gridPos, q2) * kq + t * 1.15)
             + sin(dot(gridPos, q3) * kq - t * 0.80);
    float isSpinon = smoothstep(0.10, 0.78, wv * 0.3333);
    vSpinon = isSpinon;

    // VOIDS: away from the spinon fronts only a fifth of the sites stay lit, so
    // the frame keeps genuine dark gaps between the bright cells instead of an
    // even dither.  The gate is a smooth per-site fade around that site's own
    // seed, never a hard on/off, so nothing pops as the fronts sweep past; a
    // site is only parked once it is already invisible.
    float keep = 0.20 + 0.80 * isSpinon;
    float live = smoothstep(seeds.w - 0.14, seeds.w + 0.14, keep);
    if (live < 0.02) { park(); return; }

    vec3 jitter = (seeds.xyz - 0.5) * 0.10 * (1.0 + 0.5 * isSpinon);
    vec3 worldPos = gridPos + jitter;

    // JUMP FIX: the palette index used to be dominated by RAW audioCentroid, so
    // every point in the frame swung hue together on any transient and the whole
    // picture lurched (jump=73).  The index is now mostly SPATIAL (radius, sub-
    // lattice, stacking layer) with a slow pre-integrated drift, and the
    // centroid only nudges it.
    float r = length(gridPos);
    vCol = imgPalette(fract(r * 0.16 + triangleSub * 0.333 + iz * 0.017
                            + audioAdvance * 0.02 + audioCentroid * 0.10));

    // Camera Transform (V3)
    vec3 vp = worldPos;

    // In-plane roll: keeps the wide slab facing the camera at all times.
    float ra = t * 0.15;
    float cr = cos(ra), sr = sin(ra);
    vp = vec3(vp.x * cr - vp.y * sr, vp.x * sr + vp.y * cr, vp.z);

    // A shallow yaw wobble restores the 3D read without ever swinging the
    // near face of the slab through the near plane.
    float ya = 0.16 * sin(t * 0.11);
    float cy = cos(ya), sy = sin(ya);
    vp = vec3(vp.x * cy - vp.z * sy, vp.y, vp.x * sy + vp.z * cy);

    vp.z += 4.5;
    vp.x -= eyeOff;

    // ---- LIGHT / DARK ------------------------------------------------
    // Per-site luminance, decided here where the depth and the lattice role are
    // known: a spinon on a near plane is several times the level of a dormant
    // spin on a far one, and the triangle-corner sites carry more than the
    // bond sites.  Without this every sprite landed in the same luma bucket.
    float depthLit = clamp(4.6 / max(vp.z, 0.6), 0.34, 1.5);
    float node = (triangleSub < 0.5) ? 1.0 : 0.0;
    vLum = (0.32 + 3.0 * isSpinon) * depthLit * (1.0 + 0.42 * node) * live;

    // Point size: also depth-scaled, and in 1080p-relative pixels so the sprite
    // keeps its angular size on any output.  pointSizeP is compressed into
    // 0.82..1.18 of the base -- used raw its 8..16 range swings the sprite AREA
    // by 4x, which is the whole exposure of the scene.
    float px    = resolution.y / 1080.0;
    float psMax = clamp((pointSizeP > 0.01 ? pointSizeP : 18.0), 12.0, 26.0);   // sprite sweep
    float gain  = 0.45 + 0.55 * (psMax / 12.0);
    gl_PointSize = clamp(135.0 * gain * (0.75 + 0.55 * isSpinon) * (0.55 + 0.45 * live)
                         * px / max(vp.z, 0.6),
                         max(4.0, 8.0 * px), max(8.0, 30.0 * px));
    vPointSize = gl_PointSize;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
