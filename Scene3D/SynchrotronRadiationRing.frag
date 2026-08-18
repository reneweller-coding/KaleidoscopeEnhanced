#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vRadiation;
in float vBeamID;

out vec4 fragColor;
// SynchrotronRadiationRing.frag
// -----------------------------------------------------------------------
// SYNCHROTRON RADIATION RING: a storage ring with 24 undulator wiggles -
// the electron beam glows golden where it is bent, and TANGENTIAL
// RADIATION JETS spray off along the tangent (that IS synchrotron light),
// camera orbiting with a top-down pitch.
//   audioKick -> beam + jet surge    audioBass -> wiggler amplitude
//   audioAdvance -> ring rotation + orbit
// -----------------------------------------------------------------------

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float radP;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioValence;

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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float rdp = (radP  > 0.0) ? radP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    float edge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // High energy X-ray to EUV synchrotron radiation spectrum.  The hot end
    // is GOLDEN now, not near-white -- white x high gain bleached the whole
    // ring (metric scan: saturation 0.06).
    vec3 beamColor = palTint(mix(vec3(0.1, 0.5, 1.0), vec3(1.0, 0.72, 0.30), vRadiation), 0.30 * vRadiation, 0.20);
    vec3 col = beamColor * (0.5 + 0.9 * vRadiation * rdp) * edge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.30;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, edge * 0.9);
}
