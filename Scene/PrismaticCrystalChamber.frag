#version 330 core
out vec4 fragColor;
// PrismaticCrystalChamber.frag
// -----------------------------------------------------------------------
// PRISMATIC CRYSTAL CHAMBER: 100% viewport-filling infinity mirror room
// of faceted quartz crystals and dichroic glass prisms. The loaded photo
// is reflected across multiple internal total-reflection bounces with
// chromatic dispersion, diamond facet sparkling, and kaleidoscopic symmetry.
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

uniform float facetP;
uniform float dispersionP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main() {
    float fct  = (facetP      > 0.0) ? facetP      : 1.0;
    float disp = (dispersionP > 0.0) ? dispersionP : 1.0;
    float spd  = (speedP      > 0.0) ? speedP      : 1.0;
    float hue  = (hueP        > 0.0) ? hueP        : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Ray setup inside crystal mirror room
    vec3 ro = vec3(sin(t * 0.5) * 0.8, cos(t * 0.4) * 0.6, -2.5);
    vec3 rd = normalize(vec3(uv, 1.4));

    // Dynamic rotation of crystal chamber mirrors
    float rotAngle = t * 0.4 + audioPhase * 0.15;
    float cr = cos(rotAngle), sr = sin(rotAngle);
    rd.xy = vec2(rd.x * cr - rd.y * sr, rd.x * sr + rd.y * cr);

    vec3 col = vec3(0.0);
    vec3 curP = ro;
    vec3 curDir = rd;
    float throughput = 1.0;

    // Multi-bounce crystal reflection trace
    for (int bounce = 0; bounce < 4; ++bounce) {
        // Intersect bounding crystal facet box / polyhedron
        vec3 boxSize = vec3(1.4, 1.4, 1.4) * (1.0 + 0.2 * sin(audioAdvance * 0.1));
        vec3 t1 = (-boxSize - curP) / curDir;
        vec3 t2 = ( boxSize - curP) / curDir;
        vec3 tMax = max(t1, t2);
        float dist = min(min(tMax.x, tMax.y), tMax.z);

        curP += curDir * dist;

        // Facet normal calculation
        vec3 normal = vec3(0.0);
        if (abs(curP.x - boxSize.x) < 1e-3) normal = vec3(-1.0, 0.0, 0.0);
        else if (abs(curP.x + boxSize.x) < 1e-3) normal = vec3(1.0, 0.0, 0.0);
        else if (abs(curP.y - boxSize.y) < 1e-3) normal = vec3(0.0, -1.0, 0.0);
        else if (abs(curP.y + boxSize.y) < 1e-3) normal = vec3(0.0, 1.0, 0.0);
        else if (abs(curP.z - boxSize.z) < 1e-3) normal = vec3(0.0, 0.0, -1.0);
        else normal = vec3(0.0, 0.0, 1.0);

        // Facet bevel displacement
        vec2 facetUV = (normal.x != 0.0) ? curP.yz : ((normal.y != 0.0) ? curP.xz : curP.xy);
        facetUV *= 2.5 * fct;
        vec2 facetCell = floor(facetUV);
        vec2 facetF = fract(facetUV) - vec2(0.5);

        // Perturb normal along crystal facet bevels
        normal = normalize(normal + vec3(facetF * 0.4, 0.0));

        // Sample photo with chromatic dispersion (RGB channel offset)
        vec2 sampleUV = facetUV * 0.25 + vec2(0.5) + vec2(float(bounce) * 0.1);
        float dispAmt = 0.02 * disp * (1.0 + 1.5 * audioKick);

        vec3 photoR = img(fract(sampleUV + vec2(dispAmt, 0.0)));
        vec3 photoG = img(fract(sampleUV));
        vec3 photoB = img(fract(sampleUV - vec2(dispAmt, 0.0)));
        vec3 photoSample = vec3(photoR.r, photoG.g, photoB.b);

        // Dichroic glass transmission & reflection color
        vec3 dichroicCol = imgPalette((float(bounce) * 1.5 + audioPhase) * 0.159);

        // Sparkling diamond glints on facet vertices
        float glintHash = hash21(facetCell + float(bounce) * 17.0);
        float glint = pow(max(dot(reflect(curDir, normal), normalize(vec3(0.5, 0.8, -0.6))), 0.0), 48.0);
        glint *= (1.0 + 3.0 * audioHigh * step(0.7, glintHash));

        col += (photoSample * dichroicCol * 1.4 + vec3(1.0) * glint * 2.5) * throughput;

        // Next bounce reflection
        curDir = reflect(curDir, normal);
        throughput *= 0.65;
    }

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88)); // Contrast boost
    col += vec3(0.03, 0.02, 0.06) * audioSwell;

    fragColor = vec4(col, 1.0);
}
