#version 330 core
out vec4 fragColor;
// FerrofluidHexMatrix.frag
// -----------------------------------------------------------------------
// FERROFLUID HEX MATRIX: Raymarched magnetic liquid ferrofluid pool rising
// into sharp Rosensweig instability cone spikes in a dynamic hexagonal
// magnetic lattice, with viscous fluid vortex advection, oily rainbow
// thin-film sheen, and audio-reactive magnetic field flux.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
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
uniform float audioSpectrum[32];

uniform float spikeP;
uniform float viscosityP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours
// come from a rotating arc in the CURRENT slideshow image, so every
// activation inherits a fresh palette from the photos, and the arc follows
// the musical key (chromaHue is circular-slewed = jump-free) with a slow
// advance drift.  Valence shapes saturation toward the mood.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}


vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Hexagonal tiling coordinate helper
vec4 hexGrid(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return (dot(h.xy, h.xy) < dot(h.zw, h.zw)) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + vec2(0.5, 0.5));
}

// Ferrofluid heightfield & distance function
float mapFerrofluid(vec3 p, float spk, float visc) {
    vec2 xz = p.xz;

    // Vortex swirl advection
    float r = length(xz);
    float angle = atan(xz.y, xz.x) + (time * 0.4 + audioAdvance * 0.2) / (r * 0.8 + 1.0);
    vec2 swirled = vec2(cos(angle), sin(angle)) * r;

    // Hexagonal magnetic spike lattice
    vec4 h = hexGrid(swirled * 1.6);
    vec2 hexCenter = h.zw;
    vec2 localPos = h.xy;

    // Hash for per-cell magnetic pulse
    float cellHash = fract(sin(dot(hexCenter, vec2(127.1, 311.7))) * 43758.5453);
    int specIdx = int(clamp(cellHash * 31.0, 0.0, 31.0));
    float bandEnergy = audioSpectrum[specIdx];

    // Rosensweig cone shape
    float localR = length(localPos);
    float spikeHeight = (0.6 + 1.2 * bandEnergy + 0.8 * audioBass) * spk;
    
    // Kick geyser pulse
    spikeHeight += exp(-abs(r - fract(time * 0.7) * 4.0) * 4.0) * audioKick * 1.5;

    float cone = exp(-localR * 5.0 * visc) * spikeHeight;

    // Fluid base ripples
    float ripple = sin(r * 8.0 - time * 4.0) * 0.06 * (0.5 + 0.5 * audioMid);

    float height = cone + ripple - 0.4;
    return p.y - height;
}

vec3 calcNormal(vec3 p, float spk, float visc) {
    vec2 e = vec2(0.005, 0.0);
    return normalize(vec3(
        mapFerrofluid(p + e.xyy, spk, visc) - mapFerrofluid(p - e.xyy, spk, visc),
        mapFerrofluid(p + e.yxy, spk, visc) - mapFerrofluid(p - e.yxy, spk, visc),
        mapFerrofluid(p + e.yyx, spk, visc) - mapFerrofluid(p - e.yyx, spk, visc)
    ));
}

void main() {
    float spk  = (spikeP     > 0.0) ? spikeP     : 1.0;
    float visc = (viscosityP > 0.0) ? viscosityP : 1.0;
    float spd  = (speedP     > 0.0) ? speedP     : 1.0;
    float hue  = (hueP       > 0.0) ? hueP       : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Camera setup - looking down into magnetic pool
    float camAngle = time * 0.25 * spd;
    vec3 ro = vec3(cos(camAngle) * 3.8, 2.8, sin(camAngle) * 3.8);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.4 * ww);

    float t = 0.0;
    for (int i = 0; i < 70; ++i) {
        vec3 p = ro + rd * t;
        float d = mapFerrofluid(p, spk, visc);
        if (d < 0.002 || t > 15.0) break;
        t += d * 0.65;
    }

    vec3 col = vec3(0.01, 0.01, 0.02);

    if (t < 15.0) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p, spk, visc);
        vec3 ref = reflect(rd, n);

        // Magnetic laboratory lighting
        vec3 lightPos1 = vec3(2.0, 5.0, 2.0);
        vec3 lightPos2 = vec3(-3.0, 4.0, -2.0);
        vec3 l1 = normalize(lightPos1 - p);
        vec3 l2 = normalize(lightPos2 - p);

        float diff1 = max(dot(n, l1), 0.0);
        float diff2 = max(dot(n, l2), 0.0);
        float spec1 = pow(max(dot(reflect(-l1, n), -rd), 0.0), 48.0);
        float spec2 = pow(max(dot(reflect(-l2, n), -rd), 0.0), 32.0);
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);

        // Oily rainbow thin-film sheen
        vec3 oilSheen = imgPalette(((p.x + p.z) * 4.0 + fresnel * 6.0 + audioPhase) * 0.159);

        // Reflection of photo texture
        vec2 refUV = ref.xz * 0.3 + 0.5;
        vec3 photoRef = img(fract(refUV));

        // Jet-black ferrofluid base color with specular glints
        vec3 fluidBase = vec3(0.04, 0.04, 0.05) + photoRef * 0.15;
        col = fluidBase * (diff1 * 0.5 + diff2 * 0.3 + 0.2);
        col += (vec3(1.0) * spec1 + vec3(0.7, 0.9, 1.0) * spec2) * (0.8 + 0.5 * audioHigh);
        col += oilSheen * fresnel * (0.6 + 0.8 * audioLevel);

        // Glow on spike crests
        float spikeTip = smoothstep(0.5, 1.5, p.y);
        col += vec3(0.1, 0.5, 1.0) * spikeTip * (0.4 + 1.2 * audioKick);

        // Fog
        col = mix(col, vec3(0.01, 0.01, 0.02), 1.0 - exp(-t * 0.1));
    }

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
