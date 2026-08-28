#version 330 core
out vec4 fragColor;

/**
 * @file CrossSection.frag
 * @brief A plane sweeps through a real 3D model and everything in front of it
 * is cut away, leaving the object opened like a scan through a body. The cut
 * face glows; a bright contour runs along the exact line where the surface
 * meets the plane, so the shape of the section reads even where the interior
 * is dark.
 *
 * These meshes are HOLLOW shells with no interior, so a real solid section is
 * not available. What sells it instead is that culling is off engine-wide
 * (RenderPipeline disables GL_CULL_FACE), so once the near wall is cut away
 * the FAR wall's inside is already being drawn -- shading those inward-facing
 * fragments as a machined surface reads as the inside of a solid object. Which
 * side a fragment is on is decided by the normal against the view direction,
 * NOT by gl_FrontFacing: these models wind inconsistently (the same trap
 * Detonation.frag documents).
 *
 * The plane travels on the music rather than on a clock: it advances with
 * audioAdvance and jumps forward on a kick, so a section arrives ON a beat
 * instead of drifting past it.
 *
 *   audioAdvance -> plane travel
 *   audioKick    -> forward jolt + cut-face flare
 *   audioSwell   -> contour brightness
 *   audioHigh    -> measurement ticks on the cut
 *
 * Per-instance: sizeP, spinP (turn rate), axisP (which object axis the plane
 *               travels along, 0/1/2), tintP (cut-face hue, radians).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;   // layer 0 = baseColor+opacity, layer 1 = (unused,roughness,metallic)
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float hueP;
uniform float tintP;
uniform float axisP;

uniform vec3  meshExtent;   // half-extents of THIS model, object space
uniform vec3  meshCenter;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vBg;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(mix(mix(hash11(n), hash11(n + 1.0), f.x),
                   mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
               mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
                   mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

// AUTO-EXPOSURE against the material's own average brightness. This asset set
// is not uniform -- measured base-colour luma runs from 0.14 to 0.67 -- so a
// fixed gain blows the bright models out and leaves the dark ones invisible.
// The coarsest mip IS the texture average.
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// A clinical bay rather than a landscape: this scene is an examination, and a
// busy sky would compete with the one thing worth reading, which is the shape
// of the cut.
vec3 renderSky(vec3 dir, vec3 tint)
{
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.020, 0.023, 0.032), vec3(0.052, 0.058, 0.078), h);

    // Faint measurement grid, far away and dim: it gives the eye a fixed frame
    // to judge the plane's travel against.
    vec3 a = abs(fract(dir * 7.0) - 0.5);
    float g = 1.0 - smoothstep(0.0, 0.035, min(min(a.x, a.y), a.z));
    col += tint * g * 0.16;
    return col;
}

// ---- normal mapping ------------------------------------------------------
// Layer 2 of the material array is a tangent-space normal map, present on the
// assets whose generator run produced a usable one (about a fifth of them).
//
// There are no tangents in the vertex format -- it is a fixed 8 floats shared
// by every geom kind -- so the frame is rebuilt per fragment from screen-space
// derivatives of position and UV. That is the standard cotangent-frame trick,
// and it costs nothing in the vertex stage and no change to the buffer layout.
// A model WITHOUT a normal map has materialLayers < 3 and this returns the
// interpolated normal untouched, so every scene works either way.
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv)
{
    vec3 dp1 = dFdx(p),  dp2 = dFdy(p);
    vec2 du1 = dFdx(uv), du2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * du1.x + dp1perp * du2.x;
    vec3 B = dp2perp * du1.y + dp1perp * du2.y;
    float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return mat3(T * inv, B * inv, N);
}

vec3 perturbNormal(sampler2DArray tex, int layers, vec2 uv, vec3 n, vec3 wpos, float strength)
{
    if (layers < 3) return n;
    vec3 m = texture(tex, vec3(uv, 2.0)).rgb * 2.0 - 1.0;
    // A degenerate tap (an all-black texel from a failed decode) would
    // normalize to garbage and pit the whole surface.
    if (dot(m, m) < 1e-4) return n;
    m.xy *= strength;
    return normalize(cotangentFrame(n, wpos, uv) * normalize(m));
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(0.30, 0.85, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    // ---- the cutting plane, in OBJECT space ----------------------------
    // Object space so the plane cuts the model itself; in world space a
    // turning object would sweep its own cut around, which reads as the
    // object wobbling rather than as a section being taken.
    vec3 axis = (axisP < 0.5) ? vec3(1.0, 0.0, 0.0)
              : (axisP < 1.5) ? vec3(0.0, 1.0, 0.0)
                              : vec3(0.0, 0.0, 1.0);

    // Travel on the music. A raised cosine rather than a sawtooth: the plane
    // slows at both ends, so the moment the section is largest gets held
    // instead of flashing past. (A hard wrap would also snap the whole cut
    // face across the object in one frame, which the temporal budget treats
    // as a full-frame brightness jump.)
    // Sweep across THIS model's real extent along THIS axis. A fixed range was
    // the first version's mistake: assets are normalised on their longest axis
    // only, so on a short axis the plane spent most of the cycle outside the
    // model entirely -- half the frames showed an untouched object and the
    // other half nothing at all.
    float halfLen = dot(abs(axis), meshExtent) * 1.04;   // 4% margin, so the
                                                         // sweep starts clear
                                                         // of the surface
    float travel = audioAdvance * 0.035 + time * 0.02 + audioKick * 0.045;
    float ph = fract(travel);

    // Linger where the section is LARGEST, cross the ends quickly. A raised
    // cosine does exactly the opposite -- its velocity is zero at the ENDS, so
    // the first version spent most of every cycle showing either an untouched
    // object or an empty frame, and flicked through the interesting middle.
    // A triangle wave shaped by |u|^1.6 keeps the sign and slows around zero.
    float u = 4.0 * abs(ph - 0.5) - 1.0;            // triangle, -1 .. +1
    float planeD = halfLen * sign(u) * pow(abs(u), 1.6)
                 + dot(axis, meshCenter);

    float d = dot(vLocalPos, axis) - planeD;
    if( d > 0.0 ) discard;                      // everything in front is gone

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    float ndv = dot(n, viewDir);

    vec3 base = vec3(0.5);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    // Inward-facing fragments are the inside of the far wall, exposed by the
    // cut. Shade them as machined material -- flat, bright, faintly grained --
    // so the opened volume reads as solid rather than as a hole.
    float inside = smoothstep(0.05, -0.25, ndv);

    float lam = max(dot(n, normalize(vec3(-0.4, 0.75, -0.5))), 0.0);
    vec3 col = base * (0.55 + 1.95 * lam);

    vec3 machined = mix(base * 0.7 + 0.60, tint * 1.35, 0.5);
    // Machining grain follows the plane's own axes, so it reads as a surface
    // that was CUT rather than one that was always there.
    float grain = noise3(vLocalPos * 90.0 + axis * planeD * 40.0);
    machined *= 0.80 + 0.35 * grain;
    col = mix(col, machined, inside * 0.92);

    // ---- the contour where the surface meets the plane ------------------
    // fwidth keeps it a constant width on screen whatever the model's scale
    // or how close the camera is, so it never thickens into a slab.
    float w = fwidth(d) * 1.5;
    float edge = 1.0 - smoothstep(0.0, max(w, 1e-5), abs(d));
    col += tint * edge * (3.2 + 3.0 * audioSwell + 3.4 * audioKick);

    // Measurement ticks running along the contour: bright dashes that make the
    // section read as a reading being taken, and give the highs something.
    float ticks = step(0.72, fract(dot(vLocalPos, vec3(37.0, 23.0, 31.0)) * 0.5 + time * 0.6));
    col += tint * edge * ticks * audioHigh * 2.2;

    // A short haze just behind the cut, so the opened interior has depth
    // instead of ending flat at the plane.
    col += tint * exp(d * 9.0) * 0.45 * inside;

    if( hue > 0.001 ) col = hueRot(col, 0.10 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.4 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
