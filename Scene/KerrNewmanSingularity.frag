#version 330 core
out vec4 fragColor;
// KerrNewmanSingularity.frag
// -----------------------------------------------------------------------
// KERR-NEWMAN SINGULARITY: Relativistic raymarching of a rotating charged
// black hole with Kerr-Schild spacetime metric, ergosphere frame dragging,
// gravitational light bending around the photon sphere, Doppler beaming,
// polar synchrotron plasma jets, and double-warped photo disk projections.
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

uniform float spinP;
uniform float diskP;
uniform float jetP;
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
    float spin = (spinP > 0.0) ? spinP : 1.0;
    float disk = (diskP > 0.0) ? diskP : 1.0;
    float jet  = (jetP  > 0.0) ? jetP  : 1.0;
    float hue  = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Camera setup with orbit angle
    float camAngle = time * 0.2 + audioAdvance * 0.15;
    float camPitch = 0.35 + 0.15 * sin(time * 0.15);
    vec3 ro = vec3(sin(camAngle) * cos(camPitch), sin(camPitch), cos(camAngle) * cos(camPitch)) * 5.2;
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

    // Black hole parameters
    float M = 1.0 + 0.3 * audioBass; // Mass
    float a = 0.88 * spin;            // Spin parameter (Kerr parameter)
    float rHorizon = M + sqrt(max(M * M - a * a, 0.01)); // Event horizon radius
    float rErgo = M + sqrt(max(M * M - a * a * (ro.y * ro.y / dot(ro, ro)), 0.01));

    vec3 col = vec3(0.0);
    vec3 p = ro;
    vec3 v = rd;
    float dt = 0.04;
    float totalDist = 0.0;

    // Relativistic ray tracing with curved geodesics
    for (int i = 0; i < 90; ++i) {
        float r = length(p);
        if (r < rHorizon) {
            // Ray fell into the event horizon
            col = mix(col, vec3(0.0), 0.95);
            break;
        }
        if (r > 15.0) break;

        // Frame dragging & gravitational acceleration
        // Tangential frame-dragging velocity around Y-axis
        vec3 dragDir = normalize(vec3(-p.z, 0.0, p.x));
        float omega = (2.0 * M * a * r) / (r * r * r * r + a * a * (r * r + 2.0 * M * r) + 1e-4);
        
        // Gravitational deflection towards center
        vec3 accel = -1.5 * M * normalize(p) / (r * r);
        accel += dragDir * omega * (0.8 + 0.5 * audioMid);

        v = normalize(v + accel * dt);
        p += v * dt;
        totalDist += dt;

        // Accretion disk intersection (Y ~ 0 plane)
        float diskDist = abs(p.y);
        float diskR = length(p.xz);
        if (diskDist < 0.12 && diskR > rHorizon * 1.2 && diskR < 4.8) {
            float diskDensity = exp(-diskDist * 20.0) * smoothstep(4.8, 2.5, diskR) * smoothstep(rHorizon * 1.1, rHorizon * 1.8, diskR);
            
            // Keplerian orbital velocity for Doppler beaming
            float vOrb = sqrt(M / (diskR + 1e-3));
            vec3 vDisk = normalize(vec3(-p.z, 0.0, p.x)) * vOrb;
            float doppler = 1.0 / (1.0 - dot(vDisk, -v) + 1e-3);
            doppler = clamp(doppler, 0.3, 3.5);

            // Accretion disk texture mapping
            vec2 diskUV = vec2(atan(p.z, p.x) / 6.28318 + time * 0.1 * vOrb, diskR * 0.25);
            vec3 diskColor = img(fract(diskUV));
            
            // Blackbody / synchrotron glow
            vec3 glowColor = imgPalette(0.30 * smoothstep(1.5, 3.0, doppler)) * 1.5;
            vec3 emission = (diskColor * 1.5 + glowColor * 2.0) * diskDensity * doppler * disk * (0.8 + 0.6 * audioLevel);

            col += emission * (1.0 - col.r * 0.7) * 0.35;
        }

        // Polar relativistic synchrotron plasma jets
        float jetRadius = length(p.xz);
        float jetHeight = abs(p.y);
        if (jetHeight > rHorizon * 0.8 && jetRadius < (0.2 + 0.08 * jetHeight)) {
            float jetCore = exp(-jetRadius * 12.0) * smoothstep(8.0, 1.0, jetHeight);
            vec3 jetCol = imgPalette(0.35 * fract(p.y * 2.0 - time * 4.0)) * 1.4;
            jetCol += vec3(1.0) * exp(-jetRadius * 30.0); // Ultra-hot central channel
            col += jetCol * jetCore * (0.4 + 1.8 * audioKick) * jet * 0.25;
        }
    }

    // Background cosmic photon sphere & distorted starfield
    vec2 bgUV = vec2(atan(v.z, v.x) / 6.28318 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
    vec3 bgCol = img(fract(bgUV * 2.0 + vec2(time * 0.02, 0.0))) * 0.35;
    
    // Gravitational lens ring glow (Einstein ring)
    float minR = length(p);
    float einsteinRing = exp(-abs(minR - rHorizon * 1.5) * 8.0) * (0.5 + 0.8 * audioHigh);
    vec3 ringGlow = vec3(0.9, 0.7, 0.4) * einsteinRing * (1.0 + 1.2 * audioKick);

    col += bgCol + ringGlow;

    // Apply chroma hue rotation & contrast grade
    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.85)); // Contrast boost
    col += vec3(0.04, 0.02, 0.08) * audioSwell;

    fragColor = vec4(col, 1.0);
}
