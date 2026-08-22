#version 330 core
out vec4 fragColor;
/**
 * @file MetamorphicLavaVortex.frag
 * @brief METAMORPHIC LAVA VORTEX: 100% viewport-filling viscous basalt magma
 * ocean. Solidified black obsidian crust plates drift, fracture, and submerge
 * into glowing 1500°C molten lava rivers, with convective heat shimmer,
 * incandescent fault cracks, and volcanic photo texture advection.
 */

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

uniform float magmaP;
uniform float crustP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float voronoiPlates(vec2 p, out vec2 center) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float m = 8.0;
    vec2 mCenter = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(11.2, 37.8)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m) {
                m = d;
                mCenter = n + g + o;
            }
        }
    }
    center = mCenter;
    return sqrt(m);
}

void main() {
    float mag = (magmaP > 0.0) ? magmaP : 1.0;
    float crs = (crustP > 0.0) ? crustP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Magma convective vortex advection
    vec2 vortexCenter = vec2(sin(t * 0.5) * 0.3, cos(t * 0.4) * 0.25);
    vec2 dV = uv - vortexCenter;
    float rV = length(dV);
    float swirl = exp(-rV * 2.5) * (2.5 + 1.5 * audioBass);
    vec2 warpedUV = uv + vec2(-dV.y, dV.x) * (swirl * 0.1);

    // Voronoi obsidian crust plates
    vec2 plateCenter;
    float plateDist = voronoiPlates(warpedUV * 5.0 * crs + vec2(t * 0.2, t * 0.1), plateCenter);
    float faultLine = smoothstep(0.12, 0.0, plateDist); // 1 in fault, 0 on crust

    // Heat shimmer turbulence
    float heatTurb = sin(warpedUV.x * 20.0 + time * 6.0) * cos(warpedUV.y * 20.0 + time * 5.0);
    vec2 photoUV = plateCenter * 0.15 + warpedUV * 0.4 + vec2(heatTurb * 0.015);
    vec3 photoObsidian = img(fract(photoUV));

    // Lava temperatures: 1500°C White-Hot Molten Core, 1000°C Yellow/Orange, 700°C Cherry Red, Black Obsidian
    //
    // HSV saturation is scale-invariant, so multiplying these by 2.0-3.5 never
    // cost them any: at vec3(1.0, 0.15, 0.02) the cherry red measures 0.98 and
    // stayed there through the whole shader, which is how a frame at mean luma
    // 0.09 still came out with 93% of its pixels over-saturated.  Same three
    // temperatures in the same order, given the green/blue floor that real
    // incandescence has.
    vec3 lavaWhite  = vec3(1.0, 0.98, 0.90) * 3.0;
    vec3 lavaYellow = vec3(1.0, 0.78, 0.34) * 2.2;
    vec3 lavaRed    = vec3(1.0, 0.38, 0.24) * 1.8;
    // The crust was the palette-tinted rock MULTIPLIED by the photo, i.e. the
    // picture squared, which drove the obsidian to near-black and left the
    // orange terms below as the only colour in the frame.
    vec3 obsidianCrust = palTint(mix(vec3(0.05, 0.055, 0.065), vec3(0.17, 0.15, 0.135), photoObsidian.r), 0.70, 0.18)
                       * (0.35 + 0.65 * photoObsidian);

    // Molten fault line coloring
    vec3 faultMagma = mix(lavaRed, lavaYellow, smoothstep(0.4, 0.8, faultLine));
    faultMagma = mix(faultMagma, lavaWhite, smoothstep(0.8, 1.0, faultLine));

    // Volcanic eruption flash on kick
    float eruptionFlash = faultLine * (audioKick * 2.8 + audioSubBass * 1.5) * mag;

    // Shading composition
    vec3 col = mix(obsidianCrust, faultMagma, faultLine);
    col += min(lavaWhite * eruptionFlash, vec3(1.6));

    // Convective magma surface glow.  This is the single biggest source of the
    // garish reading: exp(-rV * 2.0) covers most of the frame, so a near-pure
    // orange at saturation 0.95 was laid over EVERY pixel including the crust
    // that is meant to read as cold rock.  Same warm glow, off the ceiling.
    float coreGlow = exp(-rV * 2.0) * (0.4 + 0.6 * audioSwell);
    col += vec3(1.0, 0.55, 0.26) * coreGlow * 0.85;

    // Bounded: a full hueP rotation repainted molten rock PURPLE in the
    // probe.  Incandescence keeps its temperature; hueP only inflects.
    col = hueRot(col, 0.30 * sin(hue));

    // A last bounded pull off the saturation ceiling: lava IS orange, so this
    // is deliberately gentle -- just enough that the incandescent half of the
    // frame stops reading as a single flat primary.
    float _lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(_lum), col, 0.80);

    col = pow(max(col, 0.0), vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
