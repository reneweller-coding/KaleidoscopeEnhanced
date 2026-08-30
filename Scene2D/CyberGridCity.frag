#version 330 core
out vec4 fragColor;
/**
 * @file CyberGridCity.frag
 * @brief CYBER GRID CITY: Full-screen raymarched synthwave/cyberpunk metropolis.
 * Towering skyscrapers with illuminated neon grid windows, reflective
 * rain-slicked highway streets, rushing traffic light pulses along grids,
 * holographic photo billboards mapping tex0/tex1, and skyward neon beams.
 *   audioSubBass -> pulses ground grid shockwave & street reflections
 *   audioKick    -> flashes neon skyline & lightning storm over city
 *   audioHigh    -> sparkles skyscraper window lights & holo-glitch
 *   audioSwell   -> lifts camera elevation & deepens atmospheric volumetric fog
 *
 * Per-activation variety:
 *   speedP    float flight speed multiplier      (0.5..1.8)
 *   densityP  float building density / scale     (0.6..1.5)
 *   neonP     float neon emission intensity      (0.5..2.0)
 *   hueP      float color palette rotation       (0..6.28)
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
uniform float audioBeatPhase;

uniform float speedP;
uniform float densityP;
uniform float neonP;
uniform float hueP;
uniform float audioChromaHue;

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
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.0, 289.0)));
    return fract(vec2(262144.0, 32768.0) * n);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

void main() {
    float spd  = (speedP   > 0.0) ? speedP   : 1.0;
    float dens = (densityP > 0.0) ? densityP : 1.0;
    float neo  = (neonP    > 0.0) ? neonP    : 1.0;
    float hue  = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 screenUV = gl_FragCoord.xy / resolution;

    // Flight camera
    float camZ = time * 3.5 * spd + audioAdvance * 6.0;
    float camH = 1.2 + 0.8 * sin(time * 0.15) + audioSwell * 0.6;
    float camX = sin(time * 0.12) * 0.55;
    vec3 ro = vec3(camX, camH, camZ);
    vec3 ta = vec3(camX * 0.35, camH * 0.7 - 0.2, camZ + 8.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.2 * ww);

    // Raymarching city
    vec3 col = vec3(0.01, 0.005, 0.03); // Deep night sky
    
    // Background synthwave sun & cyber grid horizon
    if (rd.y > -0.05) {
        float sunY = 0.12 + 0.08 * sin(time * 0.05);
        vec3 sunDir = normalize(vec3(0.0, sunY, 1.0));
        float sunDot = max(dot(rd, sunDir), 0.0);
        float sunDisc = smoothstep(0.985, 0.992, sunDot);
        float sunGlow = pow(sunDot, 6.0) * 0.8;
        
        // Sun horizontal laser slices
        if (sunDisc > 0.0 && rd.y < sunY + 0.08) {
            float slice = sin(rd.y * 140.0 - time * 2.0);
            if (slice < -0.2) sunDisc *= 0.15;
        }
        vec3 sunCol = imgPalette(0.10 + 0.25 * clamp((rd.y - sunY + 0.1) * 4.0, 0.0, 1.0)) * 1.6;
        col += sunDisc * sunCol * 2.0 + sunGlow * vec3(1.0, 0.2, 0.6);

        // Cyber stars
        vec2 starUV = rd.xz / (rd.y + 0.15);
        float starN = hash21(floor(starUV * 60.0));
        if (starN > 0.985) {
            col += vec3(0.8, 0.9, 1.0) * pow(sin(starN * 100.0 + time * 3.0) * 0.5 + 0.5, 4.0) * audioHigh;
        }
    }

    float t = 0.0;
    float maxDist = 45.0;
    vec3 p = ro;
    float hitDist = -1.0;
    vec3 hitCell = vec3(0.0);
    vec3 hitNormal = vec3(0.0);
    float hitMat = 0.0; // 0: ground, 1: building, 2: billboard

    // Grid step size
    float cellW = 3.0 / dens;

    for (int i = 0; i < 70; i++) {
        p = ro + rd * t;
        if (t > maxDist) break;

        // Ground plane at y = 0
        float dGround = p.y;

        // Building grid
        vec2 cellId = floor((p.xz + cellW * 0.5) / cellW);
        vec2 localXZ = mod(p.xz + cellW * 0.5, cellW) - cellW * 0.5;

        // Street avenue in center
        float streetMask = step(0.8, abs(cellId.x)); // Open central boulevard

        float hSeed = hash21(cellId);
        float bHeight = (1.5 + 5.0 * pow(hSeed, 2.5) + audioSubBass * 1.5 * step(0.85, hSeed)) * streetMask;
        float bWidth = cellW * 0.38 * (0.6 + 0.4 * hash21(cellId + 17.1));
        
        vec3 bCenter = vec3(0.0, bHeight * 0.5, 0.0);
        float dBox = sdBox(vec3(localXZ.x, p.y - bHeight * 0.5, localXZ.y), vec3(bWidth, bHeight * 0.5, bWidth));

        float d = min(dGround, dBox);

        if (d < 0.005 * t) {
            hitDist = t;
            hitCell = vec3(cellId.x, cellId.y, hSeed);
            if (d == dGround) {
                hitMat = 0.0;
                hitNormal = vec3(0.0, 1.0, 0.0);
            } else {
                hitMat = (hSeed > 0.82) ? 2.0 : 1.0; // Billboards on special towers
                hitNormal = vec3(0.0, 1.0, 0.0); // Approximate
            }
            break;
        }
        t += max(d * 0.6, 0.04);
    }

    if (hitDist > 0.0) {
        vec3 hp = ro + rd * hitDist;
        vec3 matCol = vec3(0.0);

        if (hitMat == 0.0) {
            // Wet asphalt street with glowing neon grid
            vec2 gUV = fract(hp.xz * 0.8);
            vec2 gLine = smoothstep(0.06, 0.01, abs(gUV - 0.5));
            float gridGlow = max(gLine.x, gLine.y);
            
            // Traffic speed lines
            float trafficZ = fract(hp.z * 0.2 - time * 2.0 * spd - audioAdvance * 1.2);
            float trafficBeam = smoothstep(0.08, 0.0, abs(hp.x - 0.5)) * exp(-trafficZ * 3.0);
            float trafficBeamL = smoothstep(0.08, 0.0, abs(hp.x + 0.5)) * exp(-fract(-hp.z * 0.2 - time * 2.0 * spd) * 3.0);

            vec3 gridCol = imgPalette((hp.z * 0.1) * 0.159) * 1.5;
            matCol = vec3(0.02, 0.02, 0.04);
            matCol += gridGlow * gridCol * (1.2 + audioKick * 1.5) * neo;
            matCol += trafficBeam * vec3(0.0, 1.0, 0.9) * 3.0 + trafficBeamL * vec3(1.0, 0.2, 0.2) * 3.0;

            // Puddle reflection
            vec3 reflDir = reflect(rd, vec3(0.0, 1.0, 0.0));
            vec3 reflSky = imgPalette((reflDir.z * 2.0 + time) * 0.159) * 1.4;
            matCol += reflSky * 0.3 * (0.8 + audioSwell * 0.5);
        } else {
            // Skyscraper facade
            float floorLevel = floor(hp.y * 3.0);
            float windowX = floor(hp.x * 3.0 + hp.z * 3.0);
            float winRand = hash21(vec2(windowX, floorLevel) + hitCell.xy);
            
            vec3 bBase = vec3(0.03, 0.03, 0.06);
            
            if (hitMat == 2.0 && hp.y > 1.0 && hp.y < 3.5) {
                // Giant Holographic Billboard projecting active photo
                vec2 bUV = vec2(fract(hp.z * 0.4 + 0.5), (hp.y - 1.0) / 2.5);
                vec3 photoCol = img(clamp(bUV, 0.0, 1.0));
                // Scanlines on billboard
                photoCol *= 0.8 + 0.2 * sin(hp.y * 80.0 + time * 10.0);
                matCol = photoCol * (1.5 + audioKick * 1.0);
            } else {
                // Glowing Cyber Windows
                float winGrid = step(0.25, fract(hp.y * 3.0)) * step(0.25, fract((hp.x + hp.z) * 3.0));
                if (winRand > 0.45 && winGrid > 0.5) {
                    vec3 winCol = (winRand > 0.8) ? vec3(1.0, 0.9, 0.3) :
                                  (winRand > 0.6) ? vec3(0.1, 0.9, 1.0) : vec3(1.0, 0.2, 0.7);
                    bBase += winCol * (0.8 + 0.6 * audioHigh) * neo;
                }
                // Building edge neon trim
                vec2 cellXZ = mod(hp.xz + cellW * 0.5, cellW) - cellW * 0.5;
                float edgeGlow = smoothstep(0.08, 0.0, abs(abs(cellXZ.x) - cellW * 0.18)) +
                                smoothstep(0.08, 0.0, abs(abs(cellXZ.y) - cellW * 0.18));
                bBase += edgeGlow * vec3(0.9, 0.1, 0.8) * (1.0 + audioKick * 1.5);
                matCol = bBase;
            }
        }

        // Volumetric fog & distance atmospheric fade
        float fog = 1.0 - exp(-hitDist * (0.04 + audioSwell * 0.03));
        vec3 fogCol = imgPalette(0.60 + 0.30 * clamp(hp.y * 0.2, 0.0, 1.0)) * 0.45;
        col = mix(matCol, fogCol, fog);
    }

    // Audio-reactive lightning strike flash
    if (audioKick > 0.65) {
        // Full-frame flash: budget caps whole-frame brightness at 3 Hz.
        // A 20 Hz re-roll strobed for as long as the kick decayed.
        float strike = pow(hash21(vec2(floor(time * 3.00), 12.0)), 12.0);
        col += vec3(0.6, 0.8, 1.0) * strike * audioKick * 2.0;
    }

    // Global color styling & hue rotation
    if (hue > 0.001) col = hueRot(col, hue);
    col = pow(col, vec3(0.9)); // Punchy contrast
    
    // Vignette
    vec2 vUV = screenUV * (1.0 - screenUV.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.25), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
