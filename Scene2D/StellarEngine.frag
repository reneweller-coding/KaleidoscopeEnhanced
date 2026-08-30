#version 330 core
out vec4 fragColor;
/**
 * @file StellarEngine.frag
 * @brief STELLAR ENGINE: A gigantic Shkadov thruster (a planet-sized mirror) 
 * built to move an entire star system across the galaxy. The camera hovers 
 * behind the massive mirror as it harnesses explosive solar flares.
 *   audioAdvance -> intense propulsion and solar wind flow
 *   audioKick    -> massive plasma bursts hitting the mirror
 *   audioSwell   -> brightness of the star and reflected light
 *   audioChromaHue-> palette offset for the star's plasma
 *
 * Per-activation variety:
 *   mirrorP float complexity of the mirror structure (0.5..1.5)
 *   flareP float intensity of the solar flares (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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

uniform float mirrorP;
uniform float flareP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float mp = (mirrorP > 0.01 ? mirrorP : 1.0);
    float fp = (flareP > 0.01 ? flareP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // We are looking at the massive mirror edge-on or slightly angled, with the star behind it
    // The mirror curves around the star (parabolic)
    
    vec3 col = vec3(0.0);
    vec3 starCol = imgPalette(0.8 + audioCentroid * 0.1); // Hot orange/yellow
    vec3 structCol = imgPalette(0.3); // Metallic
    
    // Star position
    vec2 starPos = vec2(0.5, 0.0);
    float dStar = length(uv - starPos);
    
    // Mirror is a huge arc blocking the left side of the star
    // Defined in polar coords relative to star
    vec2 polarStar = vec2(dStar, atan(uv.y - starPos.y, uv.x - starPos.x));
    
    // Base mirror shape (arc from 135 to 225 degrees)
    float mirrorRadius = 0.8;
    float angleDiff = mod(polarStar.y - 3.14159, 6.28318) - 3.14159; // center at pi
    
    float mirrorArc = step(abs(angleDiff), 1.2); // Covers a large angle
    
    // Thickness of the mirror
    float mirrorThick = smoothstep(0.0, 0.02, abs(polarStar.x - mirrorRadius));
    
    if (mirrorArc > 0.5 && polarStar.x > mirrorRadius - 0.05 && polarStar.x < mirrorRadius + 0.05) {
        // We are ON the mirror structure
        float t = time * 0.1;
        float detail = fbm(vec3(polarStar.y * 50.0 * mp, polarStar.x * 200.0, t));
        
        vec3 localCol = vec3(0.1); // dark metal
        
        // Structural ribbing
        float ribs = step(0.9, fract(polarStar.y * 30.0 * mp));
        localCol = mix(localCol, structCol, ribs);
        
        // The side facing the star (inner radius) is blindingly lit
        float heat = exp(-(polarStar.x - (mirrorRadius - 0.05)) * 100.0);
        localCol += starCol * heat * (1.0 + audioSwell * 2.0);
        
        // Impact flares on the mirror surface
        float impact = step(0.99, hash11(floor(polarStar.y * 20.0) + floor(time * 4.00)));
        localCol += starCol * impact * audioKick * 5.0 * fp;
        
        col = localCol;
    } else {
        // Space around the mirror
        if (polarStar.x < mirrorRadius || mirrorArc < 0.5) {
            // View of the star and its atmosphere
            float starCore = smoothstep(0.3, 0.28, dStar);
            
            // Solar surface detail
            if (starCore > 0.0) {
                float surface = fbm(vec3((uv - starPos) * 10.0, time * 0.5 + audioAdvance));
                col += starCol * (0.8 + surface * 0.5) * starCore * (1.0 + audioSwell);
            }
            
            // Corona / Flares
            float corona = exp(-(dStar - 0.3) * 10.0);
            float flareDist = fbm(vec3(polarStar.y * 5.0, dStar * 2.0, time * 2.0));
            float flares = smoothstep(0.5, 0.8, flareDist) * exp(-(dStar - 0.3) * 5.0);
            
            col += starCol * corona * (0.5 + audioSwell * 0.5);
            col += starCol * flares * fp * (1.0 + audioKick * 2.0);
            
            // Propulsion exhaust escaping the open side
            if (abs(angleDiff) > 1.2) {
                // Solar wind being funnelled and escaping
                float wind = fbm(vec3(polarStar.x * 3.0 + time * 5.0 + audioAdvance * 5.0, polarStar.y * 5.0, 0.0));
                float windMask = smoothstep(0.3, 1.5, polarStar.x);
                col += starCol * wind * windMask * 0.5 * (1.0 + audioKick);
            }
        }
        
        // Background stars (only visible far from the glare)
        float glare = exp(-dStar * 1.5);
        if (glare < 0.5) {
            // Runde, gejitterte Sterne statt aufgehellter floor()-Zellen
            // (Quadrat-Pixel).
            vec2 sgrid = uv * 55.0;
            vec2 sid = floor(sgrid);
            vec2 sfr = fract(sgrid) - 0.5;
            float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
            if (sh > 0.90) {
                vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
                float sd2 = dot(sfr - spos, sfr - spos);
                float stw = 0.7 + 0.3 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
                col += vec3(1.0) * exp(-sd2 * 250.0) * stw * (0.35 + audioSwell * 0.25) * (1.0 - glare);
            }
        }
        
        // Overwhelming glare over everything
        col += starCol * glare * 0.2 * (1.0 + audioSwell);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
