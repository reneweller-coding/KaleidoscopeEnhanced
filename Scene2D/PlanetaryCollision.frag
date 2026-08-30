#version 330 core
out vec4 fragColor;
/**
 * @file PlanetaryCollision.frag
 * @brief PLANETARY COLLISION: The apocalyptic moment two massive planets collide.
 * Crusts shatter, oceans boil into space, and glowing magma is exposed in the 
 * catastrophic impact zone. Huge shockwaves of debris violently explode outward 
 * with every audio kick.
 *   audioAdvance -> intense chaotic movement of the colliding crusts
 *   audioKick    -> massive explosive shockwaves and magma bursts
 *   audioSwell   -> blinding heat and brightness of the impact zone
 *   audioChromaHue-> palette offset for the molten rock and plasma
 *
 * Per-activation variety:
 *   impactP float intensity of the shatter and debris (0.5..1.5)
 *   heatP float temperature/brightness of the collision (0.5..2.0)
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

uniform float impactP;
uniform float heatP;
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

// Ridged noise for shattered crust
float ridged(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { 
        f += a * (1.0 - abs(noise(p) * 2.0 - 1.0)); 
        p *= 2.0; a *= 0.5; 
    }
    return f;
}

void main()
{
    float ip = (impactP > 0.01 ? impactP : 1.0);
    float hp = (heatP > 0.01 ? heatP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    vec3 crustColor1 = vec3(0.1, 0.12, 0.15); // Rocky/water planet
    vec3 crustColor2 = vec3(0.15, 0.1, 0.05); // Rocky/desert planet
    vec3 magmaColor = imgPalette(0.8 + audioCentroid * 0.1); // Intense heat
    
    // Centers of the two planets
    // They are overlapping heavily to show the collision in progress
    vec2 p1Center = vec2(-0.3, -0.2);
    vec2 p2Center = vec2(0.3, 0.2);
    
    float p1Rad = 0.7;
    float p2Rad = 0.6;
    
    float d1 = length(uv - p1Center);
    float d2 = length(uv - p2Center);
    
    // Impact zone is where they intersect
    float impactZone = smoothstep(0.4, 0.0, d1) * smoothstep(0.4, 0.0, d2);
    
    // Overall masking for the combined planetary mass
    float mass = max(smoothstep(p1Rad, p1Rad - 0.05, d1), smoothstep(p2Rad, p2Rad - 0.05, d2));
    
    if (mass > 0.0) {
        // Base planet textures
        // We distort the coordinates in the impact zone
        vec2 distortUv = uv + normalize(uv) * impactZone * (fbm(vec3(uv * 10.0, time + audioAdvance)) * 0.5);
        
        float tex1 = fbm(vec3((distortUv - p1Center) * 5.0, time * 0.1));
        float tex2 = fbm(vec3((distortUv - p2Center) * 6.0, time * 0.1 + 10.0));
        
        vec3 pCol = mix(crustColor1 * tex1, crustColor2 * tex2, smoothstep(-0.1, 0.1, uv.x));
        
        // Shattered crust - deep glowing cracks radiating from impact
        float crackDist1 = length(distortUv - (p1Center + p2Center) * 0.5);
        
        // Huge jagged ridges
        float shatter = ridged(vec3(distortUv * 8.0, time * 0.2 + audioAdvance));
        
        // The closer to the impact zone, the more shattered it is and the brighter the magma
        float damage = exp(-crackDist1 * 4.0) * ip;
        float cracks = smoothstep(0.7 - damage * 0.3, 1.0, shatter);
        
        // Magma bleeding through the shattered crust
        vec3 surfaceCol = mix(pCol, magmaColor * (1.0 + hp * 2.0), cracks * damage);
        
        // The pure impact zone is a blinding mess of magma and plasma
        float pureImpact = exp(-crackDist1 * 10.0);
        float impactNoise = fbm(vec3(distortUv * 20.0, time * 5.0 + audioAdvance * 5.0));
        surfaceCol = mix(surfaceCol, magmaColor * (2.0 + impactNoise * 2.0) * (1.0 + audioSwell * 2.0) * hp, pureImpact);
        
        // Add violent flashes on kicks directly in the impact zone
        float explosion = step(0.9, hash11(floor(time * 4.00)));   // was 10 Hz
        surfaceCol += magmaColor * explosion * audioKick * 10.0 * hp * pureImpact;
        
        col += surfaceCol * mass;
        
        // Limb darkening on the outer edges, but brightening in the center
        float outerLimb = smoothstep(1.0, 0.8, max(d1 / p1Rad, d2 / p2Rad));
        col *= outerLimb;
        
    } else {
        // Deep space
        // Runde, gejitterte Sterne: ganze floor()-Zellen aufzuhellen ergibt
        // QUADRATE (der wiederholt gemeldete "Riesenpixel"-Fehler).
        vec2 sgrid = uv * 60.0;
        vec2 sid = floor(sgrid);
        vec2 sfr = fract(sgrid) - 0.5;
        float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
        if (sh > 0.90) {
            vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
            float sd2 = dot(sfr - spos, sfr - spos);
            float stw = 0.7 + 0.3 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
            col += vec3(1.0) * exp(-sd2 * 250.0) * stw * (0.35 + audioSwell * 0.25);
        }
    }
    
    // Ejecta / Debris / Shockwaves exploding outward
    // Radial shockwaves blasting from the center
    vec2 impactCenter = (p1Center + p2Center) * 0.5;
    vec2 dir = uv - impactCenter;
    float dist = length(dir);
    
    if (dist > 0.1) {
        // A shockwave expanding outward with audio kicks
        // We use fract of time to make continuous rings, multiplied by kick
        float shockSpeed = time * 3.0 + audioAdvance * 5.0;
        float shockRing = step(0.95, fract(dist * 5.0 - shockSpeed));
        
        // Break up the shockwave into fiery debris
        float debrisNoise = fbm(vec3(normalize(dir) * 10.0, shockSpeed));
        float debris = smoothstep(0.6, 0.8, debrisNoise);
        
        // Shockwave is extremely bright when an audio kick happens
        float shockInt = shockRing * debris * (audioKick * 5.0 + audioSwell) * hp * ip;
        shockInt *= exp(-dist * 2.0); // fades as it gets further
        
        col += magmaColor * shockInt;
        
        // Continuous fine glowing dust being blown away
        float dust = fbm(vec3(dir * 5.0, time * 2.0 + audioAdvance * 3.0));
        float dustMask = smoothstep(0.0, 0.5, dist) * exp(-dist * 3.0);
        col += magmaColor * dust * dustMask * 0.5 * (1.0 + audioSwell) * hp;
    }
    
    // Massive glare over the whole scene from the intense heat
    float glare = exp(-length(uv - impactCenter) * 2.0);
    col += magmaColor * glare * (0.2 + audioSwell * 0.5) * hp;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
