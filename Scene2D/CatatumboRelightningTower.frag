#version 330 core
out vec4 fragColor;
/**
 * @file CatatumboRelightningTower.frag
 * @brief CATATUMBO RELIGHTNING TOWER: Nocturnal continuous electrical storm column
 * above Lake Maracaibo. Kilometers-tall intra-cloud lightning arcs, methane-ionized
 * plasma channels, volumetric anvil cloud illuminations, and thunderous photo reflections.
 *   audioAdvance -> navigates atmospheric storm updrafts & cloud turbulence
 *   audioKick    -> fires explosive stepped leader lightning arc detonations
 *   audioSnare   -> triggers spiderweb cloud-to-cloud branch discharges
 *   audioSubBass -> rumbles volumetric thunder shockwave expansion
 *   audioSwell   -> thickens dense anvil cloud mist & ionization glow
 *
 * Per-activation variety:
 *   branchP  float lightning fractal branching complexity   (1.0..3.5)
 *   cloudP   float volumetric anvil cloud turbulence        (0.6..2.0)
 *   flashP   float stepped leader arc flash brightness      (0.8..2.5)
 *   methaneP float methane ionization blue/violet tint      (0.2..1.5)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSnare;
uniform float audioFlux;

uniform float branchP;
uniform float cloudP;
uniform float flashP;
uniform float methaneP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = sin(dot(i, vec2(12.9898, 78.233)) * 43758.5453);
    float b = sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233)) * 43758.5453);
    float c = sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233)) * 43758.5453);
    float d = sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233)) * 43758.5453);
    return mix(mix(fract(a), fract(b), f.x), mix(fract(c), fract(d), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Cloud anvil background & turbulence
    float cloudTurb = (cloudP > 0.01 ? cloudP : 1.2);
    vec2 cloudCoord = uv * 2.0 * cloudTurb + vec2(0.0, -t * 0.2);
    float clouds = fbm(cloudCoord) * (0.8 + 0.4 * audioSwell);
    
    // Main vertical lightning channel column
    float branchComplexity = (branchP > 0.01 ? branchP : 1.5);
    float mainArcDist = 1e5;
    
    for (float i = 0.0; i < 3.0; i += 1.0) {
        float xOffset = (i - 1.0) * 0.35 + sin(t * 0.8 + i) * 0.1;
        float jagged = fbm(vec2(uv.y * 6.0 * branchComplexity, t * 2.0 + i * 1.5)) * 0.35 - 0.175;
        float d = abs(uv.x - (xOffset + jagged));
        mainArcDist = min(mainArcDist, d);
    }
    
    // Spiderweb branch discharges
    float branchArc = abs(sin(uv.x * 8.0 + uv.y * 12.0 + fbm(uv * 10.0 + t) * 4.0));
    float branchIntensity = exp(-branchArc * 8.0) * (0.4 + 1.8 * audioSnare);
    
    // Lightning plasma channel glow
    float arcCore = exp(-mainArcDist * 90.0) * (1.0 + 4.0 * audioKick) * (flashP > 0.01 ? flashP : 1.5);
    float arcHalo = exp(-mainArcDist * 12.0) * (0.8 + 1.5 * audioMid);
    
    // Cloud illumination by lightning flashes
    float cloudIllum = clouds * (arcHalo * 1.5 + audioKick * 0.6);
    
    // Methane ionization color: Deep violet-cyan identity tinted with photo palette
    vec3 methaneViolet = vec3(0.55, 0.2, 0.95);
    vec3 lightningBlue  = vec3(0.1, 0.6, 1.0);
    vec3 arcColor = palTint(mix(lightningBlue, methaneViolet, sin(audioCentroid * 3.14) * 0.5 + 0.5), mainArcDist * 2.0, 0.25);
    
    // Background photo texture
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg;
    col += palTint(vec3(0.08, 0.12, 0.22), clouds * 0.5, 0.2) * (0.5 + clouds * 0.7);
    col += arcColor * cloudIllum * 1.6;
    col += arcColor * branchIntensity * 1.4;
    col += vec3(0.9, 0.95, 1.0) * arcCore * 2.5;
    col += arcColor * arcHalo * 1.2;
    col += arcColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
