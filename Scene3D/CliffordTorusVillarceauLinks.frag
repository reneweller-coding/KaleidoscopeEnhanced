#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in float vIndex;
in float vDust;

/**
 * @file CliffordTorusVillarceauLinks.frag
 * @brief Shades the interlinked Villarceau circles of a Clifford torus (its
 * characteristic linked-loop decomposition) as a SOLID stereographic surface
 * reaching past the top and bottom edges, blending the slideshow photo with a
 * topological-phase colour and simple diffuse/specular lighting, then fading
 * to a dark fog with distance -- over a faint field of 4D dust motes that
 * carries the corners the donut can never reach.
 *
 * audioPhase offsets imgPalette()'s sample point per-loop (via vIndex), so
 * each linked circle's colour cycles with the audio phase; audioKick
 * brightens the specular highlight and swells the cubes; audioSwell sizes the
 * dust motes; audioChromaHue and the hueP preset both apply a final hue
 * rotation via hueRot(). torusP/linkP/speedP are declared for the companion
 * vertex shader's torus radius/link count/rotation speed.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float torusP;
uniform float linkP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto cube faces
    vec3 photo = img(vTexCoord);

    // Villarceau topological phase palette
    vec3 torusColor = imgPalette(vIndex + audioPhase * 0.159);

    // Diffuse + Specular lighting. A second, dimmer fill from the opposite side
    // keeps the away-facing cube faces from going dead black: vNormal is an
    // axis-aligned CUBE FACE normal, so with one key light three of the six
    // faces returned diff == 0 exactly and rendered as holes in the surface.
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.6));
    vec3 fillDir  = normalize(vec3(-0.6, -0.3, 0.75));
    float diff = max(dot(vNormal, lightDir), 0.0)
               + 0.42 * max(dot(vNormal, fillDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);

    vec3 col;

    if (vDust > 0.5)
    {
        // 4D DUST: the same palette, far dimmer and unlit -- a background
        // layer that fills the frame without lifting it toward grey.
        // Per-mote brightness spread so the dust field carries its own contrast
        // instead of being one uniform sub-threshold level.
        float mote = 0.55 + 0.75 * fract(vIndex * 37.13);
        col = mix(torusColor, photo, 0.30) * (0.16 + 0.09 * audioSwell) * mote;
    }
    else
    {
        col = mix(photo, torusColor, 0.45);
        col = col * (0.26 + 0.80 * diff)
            + vec3(1.0, 0.95, 0.8) * min(spec * (1.0 + audioKick * 2.0), 1.1);

        // Distance fog.
        // This used length(vWorldPos) -- the distance from the TORUS's own
        // centre, not from the camera. A point on the donut's left rim is just
        // as far from that centre as one on its far side, so the fog painted a
        // radial vignette onto the object and crushed its whole outer half to
        // the 0.02 background colour regardless of depth. The camera sits 9
        // units back along +z (see the .vert), so that is where depth is
        // measured from, and only beyond the object's own radius.
        float camDist = length(vec3(vWorldPos.xy, vWorldPos.z + 9.0));
        col = mix(col, vec3(0.03, 0.045, 0.09),
                  1.0 - exp(-max(camDist - 5.5, 0.0) * 0.075));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Soft knee: a big specular face on a swollen cube must not clip the
    // picture to flat white on every kick.
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
