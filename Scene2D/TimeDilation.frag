#version 330 core
out vec4 fragColor;
/**
 * @file TimeDilation.frag
 * @brief TIME DILATION: Falling into a supermassive black hole, experiencing 
 * extreme time dilation. The universe outside speeds up to infinity, turning 
 * into blurred streaks of light, while the event horizon below stretches forever. 
 * Audio kicks violently distort the space-time fabric.
 *   audioAdvance -> descent speed into the gravity well
 *   audioKick    -> violent space-time tearing/glitches
 *   audioSwell   -> blinding brightness of the infinitely accelerated outer universe
 *   audioChromaHue-> palette offset for the relativistic shifting
 *
 * Per-activation variety:
 *   warpP float intensity of the space-time distortion (0.5..1.5)
 *   streakP float length and brightness of the star streaks (0.5..2.0)
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

uniform float warpP;
uniform float streakP;
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
    float wp = (warpP > 0.01 ? warpP : 1.0);
    float sp = (streakP > 0.01 ? streakP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    // We are looking DOWN into the black hole
    // The center is the singularity (black), the edges are the outside universe (bright)
    
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    vec3 col = vec3(0.0);
    
    vec3 holeColor = vec3(0.0); // Absolute nothingness
    vec3 universeColor = imgPalette(0.8 + audioCentroid * 0.1); // Blueshifted outer universe
    
    // 1. Space-time tearing / Glitches on Kick
    // Violent radial tearing
    float tear = 0.0;
    if (audioKick > 0.1) {
        float tearNoise = fbm(vec3(angle * 10.0, time * 20.0, 0.0));
        if (tearNoise > 0.7) {
            // Offset UV radially
            uv *= 1.0 + audioKick * 0.2 * wp;
            dist = length(uv);
            tear = 1.0;
        }
    }
    
    // The Event Horizon (stretched by our descent)
    // As we fall, the dark circle of the BH covers more of our vision
    // We simulate this by making the central black area grow
    
    // Instead of actually making it grow, we just keep it fixed and make the edges zoom past us
    float horizonRad = 0.3;
    
    if (dist > horizonRad) {
        // Outside the event horizon
        // The universe speeds up infinitely, turning stars into radial streaks
        
        // Distance from the horizon outwards (0 at horizon, goes to infinity)
        float dOut = dist - horizonRad;
        
        // Relativistic optical distortion (looks like a tunnel)
        float z = 1.0 / max(dOut, 0.001);
        
        // The speed at which the outer universe passes by is extreme
        float speed = time * 20.0 + audioAdvance * 50.0;
        
        // Map to cylindrical coordinates for the streaks
        float u = angle * 5.0; // wrap around
        float v = z - speed; // rushing towards us
        
        // Star streaks (stretched noise)
        float streakNoise = fbm(vec3(u, v * 0.1, 0.0));
        float streaks = smoothstep(0.6, 1.0, streakNoise) * sp;
        
        // The stars are heavily blueshifted due to our fall (bright, energetic)
        vec3 streakCol = universeColor * streaks * (2.0 + audioSwell * 2.0);
        
        // The closer to the horizon, the more distorted and redshifted the light gets 
        // just before it crosses (the accretion disk / photon sphere)
        
        float photonSphere = exp(-dOut * 10.0 * wp);
        vec3 diskColor = imgPalette(0.2); // Redshifted
        
        float diskNoise = fbm(vec3(angle * 10.0, dOut * 50.0 - time * 5.0, time));
        
        streakCol = mix(streakCol, diskColor * diskNoise * 5.0 * (1.0 + audioSwell), photonSphere);
        
        // Fade out at the very edges of the screen
        float edgeFade = smoothstep(2.0, 0.5, dist);
        col = streakCol * edgeFade;
        
    } else {
        // Inside the event horizon
        // Nothing escapes, but we can add some quantum foam or Hawking radiation glitches
        float insideD = dist / horizonRad;
        
        // Deep quantum noise
        float quantum = fbm(vec3(uv * 50.0, time * 2.0));
        float qMask = smoothstep(0.9, 1.0, quantum) * exp(-insideD * 5.0);
        
        col = universeColor * qMask * audioKick * wp;
    }
    
    // The glaring edge of the photon sphere
    float edgeGlare = exp(-abs(dist - horizonRad) * 40.0) * wp;
    col += universeColor * edgeGlare * (0.5 + audioSwell);
    
    // Add violent glitch color shifts
    if (tear > 0.0) {
        col = col.gbr * 2.0;
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
