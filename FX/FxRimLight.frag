#version 330 core
out vec4 fragColor;
/**
 * @file FxRimLight.frag
 * @brief FX RIM LIGHT: relights the scene from behind using a surface
 * normal reconstructed from the real depth buffer, adding a grazing-angle
 * rim highlight plus an opposing fill light.
 *
 * Uses whichever of the forward/backward depth differences spans the
 * smaller step, per axis, so the reconstructed normal (and therefore the
 * rim) stays clean right up to silhouette edges; the key light's direction
 * and colour drift with dayPhase and the harmonic hue.
 *   interpolation -> cross-fades the two rim-lit scene layers
 *   audioKick     -> flashes the rim-light intensity
 *   audioLevel    -> adds to the rim-light intensity
 *   audioAmbient  -> strengthens the opposing fill light
 *   audioChromaHue-> tints the key/fill light colours with the harmonic hue
 *   audioHigh     -> adds a touch of key-coloured highlight
 *   audioSubBass  -> subtle overall brightness pulse
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxRimLight.frag — relight the frame from behind, using only depth.
// -----------------------------------------------------------------------
// A rim needs a surface normal, and the depth buffer does not store one.  It can
// be recovered: unproject three neighbouring pixels into view space and cross
// the two edge vectors.  The catch is what happens at a silhouette, where the
// neighbour belongs to a completely different surface — the reconstructed normal
// there is garbage, and since a silhouette is exactly where a rim is brightest,
// the artefact lands precisely where the effect is supposed to live.  A naive
// version fringes every object with a ragged halo.
//
// The standard answer, and the one used here: take BOTH the forward and the
// backward difference and keep whichever spans the smaller step in depth.  At an
// interior pixel they agree.  At a silhouette one of them crosses the gap and
// the other stays on the near surface, so the near surface wins and its normal
// stays correct right up to the last pixel of the edge.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texDepth0;
uniform sampler2D texDepth1;
uniform vec2  depthValid;
uniform vec2  nearFar;
uniform float tanHalfFov;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float dayPhase;

uniform float rimP;         // preset: rim strength
uniform float sharpP;       // preset: how tight the rim band is
uniform float fillP;        // preset: opposing fill light

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

vec3 viewPos(vec2 uv, float z)
{
    vec2 ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max(resolution.y, 1.0);
    return vec3(ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0) * z;
}

vec3 lit(sampler2D src, sampler2D dep, vec2 uv, float valid, vec2 px,
         vec3 keyDir, vec3 keyCol, vec3 fillDir, vec3 fillCol, float sharp)
{
    vec3 c = texture(src, uv).rgb;
    if (valid < 0.5)
        return c;

    float zc = linearise(texture(dep, uv).r);
    // Nothing there: the far plane is sky, and relighting sky produces a bright
    // frame edge where the geometry simply stops.
    if (zc > nearFar.y * 0.94)
        return c;

    float zr = linearise(texture(dep, uv + vec2(px.x, 0.0)).r);
    float zl = linearise(texture(dep, uv - vec2(px.x, 0.0)).r);
    float zu = linearise(texture(dep, uv + vec2(0.0, px.y)).r);
    float zd = linearise(texture(dep, uv - vec2(0.0, px.y)).r);

    vec3 P = viewPos(uv, zc);

    // Keep the difference that stays on this surface.
    vec3 dx = (abs(zr - zc) < abs(zc - zl))
            ? viewPos(uv + vec2(px.x, 0.0), zr) - P
            : P - viewPos(uv - vec2(px.x, 0.0), zl);
    vec3 dy = (abs(zu - zc) < abs(zc - zd))
            ? viewPos(uv + vec2(0.0, px.y), zu) - P
            : P - viewPos(uv - vec2(0.0, px.y), zd);

    vec3 N = normalize(cross(dx, dy));
    vec3 V = normalize(-P);
    if (dot(N, V) < 0.0) N = -N;

    // The rim: grazing angles only, tightened by the preset.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), mix(1.6, 6.0, clamp(sharp, 0.0, 1.0)));
    // Back-lit, so the rim only appears where the key is actually behind the
    // surface — a rim that ignores the light direction is just an outline.
    float back = clamp(dot(N, keyDir) * 0.5 + 0.5, 0.0, 1.0);

    vec3 col = c;
    col += keyCol * fres * back * (0.8 + 2.2 * rimP)
         * (0.55 + 0.9 * audioKick + 0.35 * audioLevel);
    col += fillCol * max(dot(N, fillDir), 0.0) * (0.25 * fillP)
         * (0.5 + 0.6 * audioAmbient);
    return col;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    // The key swings slowly, and behind the subject: a rim light lives roughly
    // opposite the camera, so the direction is mostly +z in view space.
    float a = time * 0.11 + 6.2831853 * dayPhase * 0.25;
    vec3 keyDir  = normalize(vec3(0.75 * sin(a), 0.30 + 0.25 * cos(a * 0.7), 0.75));
    vec3 fillDir = normalize(vec3(-0.6, -0.25, 0.35));

    vec3 keyCol = hue2rgb(fract(0.55 + 0.30 * sin(audioChromaHue) + 0.08 * sin(a)));
    keyCol = mix(keyCol, vec3(1.0), 0.30);
    vec3 fillCol = mix(vec3(0.25, 0.35, 0.55), hue2rgb(fract(0.12 + 0.2 * sin(a))), 0.35);

    float sharp = clamp(sharpP, 0.0, 1.0);
    vec3 A = lit(tex0, texDepth0, uv, depthValid.x, px, keyDir, keyCol, fillDir, fillCol, sharp);
    vec3 B = lit(tex1, texDepth1, uv, depthValid.y, px, keyDir, keyCol, fillDir, fillCol, sharp);
    vec3 col = mix(B, A, clamp(interpolation, 0.0, 1.0));

    col *= 1.0 + 0.12 * audioBeat + 0.10 * audioSubBass;
    col += keyCol * 0.04 * audioHigh;
    col = col / (1.0 + col * 0.16);
    fragColor = vec4(col, 1.0);
}
