#version 330 core
out vec4 fragColor;
// StainedGlassCathedralCaustics.frag
// -----------------------------------------------------------------------
// STAINED GLASS CATHEDRAL CAUSTICS: 100% viewport-filling Gothic cathedral
// rose window. The loaded photo is transformed into a luminous stained glass
// masterpiece with procedural lead tracery, antique bubbled glass refraction,
// and volumetric sunbeams (godrays) casting jewel-toned caustics.
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

uniform float traceryP;
uniform float godrayP;
uniform float glassP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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
    float trc = (traceryP > 0.0) ? traceryP : 1.0;
    float gdr = (godrayP  > 0.0) ? godrayP  : 1.0;
    float gls = (glassP   > 0.0) ? glassP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // 16-fold Gothic rosette symmetry
    float sectors = 16.0;
    float sectorAngle = 6.2831853 / sectors;
    float symAngle = mod(angle + time * 0.05 + audioAdvance * 0.05 + 0.5 * sectorAngle, sectorAngle) - 0.5 * sectorAngle;
    vec2 symUV = vec2(cos(symAngle), sin(symAngle)) * r;

    // Procedural Gothic lead came (tracery borders)
    float ring1 = abs(r - 0.22);
    float ring2 = abs(r - 0.45);
    float ring3 = abs(r - 0.70);
    float petal = abs(sin(symAngle * 8.0) * 0.18 + 0.35 - r);
    float spokes = abs(symAngle * r);

    float leadTracery = min(min(min(ring1, ring2), min(ring3, petal)), spokes) * trc;
    float leadCame = smoothstep(0.008, 0.018, leadTracery); // 0 at lead borders, 1 in glass

    // Antique bubbled glass refraction
    float glassNoise = hash21(floor(symUV * 40.0 * gls));
    vec2 glassDisplace = vec2(
        sin(glassNoise * 6.28 + time * 0.5),
        cos(glassNoise * 6.28 + time * 0.5)
    ) * (0.015 * gls);

    // Photo texture embedded in stained glass panels
    vec2 photoUV = symUV * 0.8 + vec2(0.5) + glassDisplace;
    vec3 stainedPhoto = img(fract(photoUV));

    // Jewel-tone color enhancement (ruby reds, sapphire blues, emeralds, amber)
    stainedPhoto = pow(stainedPhoto, vec3(0.8)) * 1.5;

    // Dark cast-lead borders
    vec3 leadColor = vec3(0.06, 0.07, 0.09);
    vec3 glassColor = mix(leadColor, stainedPhoto, leadCame);

    // Volumetric sunbeams (godrays) streaming from sunlight source
    vec2 lightSource = vec2(sin(time * 0.2) * 0.3, 0.2 + cos(time * 0.15) * 0.2);
    vec2 rayDir = uv - lightSource;
    float rayDist = length(rayDir);
    float sunRay = sin(atan(rayDir.y, rayDir.x) * 24.0 + time * 2.0) * 0.5 + 0.5;
    sunRay = pow(sunRay, 4.0) * exp(-rayDist * 1.2);

    vec3 godrayColor = (stainedPhoto + vec3(1.0, 0.9, 0.6)) * sunRay * (1.2 + 2.5 * audioKick) * gdr * (0.8 + 0.6 * audioSwell);

    // Bass vibration on cathedral window panels
    float bassVibe = sin(r * 40.0 - time * 12.0) * audioBass * 0.2 * leadCame;
    glassColor += vec3(0.2, 0.6, 1.0) * bassVibe;

    vec3 col = glassColor + godrayColor;

    // Subtle cathedral interior ambient depth
    col += vec3(0.04, 0.02, 0.06) * (1.0 - leadCame);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
