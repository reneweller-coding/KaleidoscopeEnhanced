#version 330 core
out vec4 fragColor;
/**
 * @file SupermassiveBlackHoleOrbit.frag
 * @brief SUPERMASSIVE BLACK HOLE: A terrifying orbit around the event horizon of 
 * a supermassive black hole. Intense gravitational lensing distorts the background
 * starfield, while the searing accretion disk pulses with the beat.
 *   audioAdvance -> camera orbit speed
 *   audioKick    -> intense energy flares in the accretion disk
 *   audioSwell   -> brightness and width of the photon ring
 *   audioChromaHue-> palette offset for the accretion disk
 *
 * Per-activation variety:
 *   massP float mass/size of the black hole (0.5..1.5)
 *   diskP float density of the accretion disk (0.5..1.5)
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

uniform float massP;
uniform float diskP;
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

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Very simple background starfield
vec3 background(vec3 rd) {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float sc = 50.0 + 50.0 * float(i);
        vec3 st = rd * sc;
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.98) {
            col += vec3(1.0, 0.9, 0.8) * exp(-length(f) * length(f) * 400.0);
        }
    }
    // Add milky way band
    float band = pow(max(1.0 - abs(rd.y * 3.0), 0.0), 2.0);
    col += vec3(0.05, 0.1, 0.2) * band * fbm(rd * 10.0);
    return col;
}

void main()
{
    float mp = (massP > 0.01 ? massP : 1.0);
    float dp = (diskP > 0.01 ? diskP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;
    
    // Camera orbit
    vec3 ro = vec3(10.0 * cos(t), 2.0 * sin(t * 0.5), 10.0 * sin(t));
    vec3 ta = vec3(0.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    // Camera roll
    float roll = 0.1 * sin(t * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    // Black hole parameters
    float rs = 1.5 * mp; // Schwarzschild radius
    
    // Gravitational lensing (raymarching with curved rays)
    vec3 p = ro;
    vec3 v = rd;
    float dt = 0.2;
    
    vec3 col = vec3(0.0);
    vec3 diskColor = imgPalette(0.8 + audioCentroid * 0.2);
    
    float inHorizon = 0.0;
    
    // Tilt the accretion disk
    mat2 diskTilt = rot(0.2);

    for (int i = 0; i < 80; i++) {
        float r = length(p);
        
        // Check if inside event horizon
        if (r < rs) {
            inHorizon = 1.0;
            break;
        }
        
        // Gravity bends the ray direction towards the origin
        // Very simplified deflection
        vec3 force = -normalize(p) * (rs * 0.05) / (r * r);
        v = normalize(v + force * dt);
        p += v * dt;
        
        // Render accretion disk
        vec3 dp3 = p;
        dp3.yz = diskTilt * dp3.yz; // Apply tilt
        
        float dr = length(dp3.xz);
        float dy = abs(dp3.y);
        
        // Disk exists between rs*1.5 and rs*5.0
        if (dr > rs * 1.5 && dr < rs * 5.0 && dy < 0.2 * dr) {
            // Flow around the black hole
            float angle = atan(dp3.z, dp3.x);
            float flowSpeed = time * 5.0 * (rs / dr) + audioPhase * 2.0;
            float diskDens = fbm(vec3(dr * 2.0, angle * 5.0 - flowSpeed, time));
            
            // Doppler shift (fake) based on velocity relative to camera
            vec3 vel = normalize(vec3(-dp3.z, 0.0, dp3.x));
            float doppler = dot(vel, v); // > 0 means moving away (redshift), < 0 means towards (blueshift)
            vec3 shiftedColor = mix(diskColor * vec3(0.5, 0.8, 1.5), diskColor * vec3(1.5, 0.8, 0.5), doppler * 0.5 + 0.5);
            
            // Kick flashes in the disk
            float flash = step(0.9, hash11(floor(dr * 5.0) + floor(angle * 10.0 - flowSpeed)));
            shiftedColor *= 1.0 + flash * audioKick * 3.0;
            
            float alpha = smoothstep(0.4, 0.8, diskDens) * dp * 0.1 * (rs * 3.0 / dr);
            col += shiftedColor * alpha * (1.0 + audioSwell * 2.0);
        }
        
        // Photon ring (intense glow near rs*1.5)
        float photonDist = abs(r - rs * 1.5);
        if (photonDist < 0.5) {
            col += diskColor * exp(-photonDist * 5.0) * 0.02 * (1.0 + audioSwell);
        }
    }
    
    // If ray escaped, sample background
    if (inHorizon < 0.5) {
        col += background(v) * (0.2 + audioSwell * 0.2);
    }
    
    // Color grading / final vignette
    col *= 1.2;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
