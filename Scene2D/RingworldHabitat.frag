#version 330 core
out vec4 fragColor;
/**
 * @file RingworldHabitat.frag
 * @brief RINGWORLD HABITAT: The camera flies high above the inner surface of a 
 * colossal, ring-shaped megastructure. The terrain curves dramatically upward 
 * into the sky, revealing oceans, continents, and sprawling city lights that 
 * react to the beat.
 *   audioAdvance -> flight speed over the landscape
 *   audioKick    -> flashes from the city clusters
 *   audioSwell   -> ambient daylight and cloud brightness
 *   audioChromaHue-> palette offset for the landscape and cities
 *
 * Per-activation variety:
 *   cityP float density of city clusters (0.5..1.5)
 *   cloudP float cloud density (0.5..1.5)
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

uniform float cityP;
uniform float cloudP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

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

float hitMat = 0.0;
float cityGlow = 0.0;

// The ringworld is essentially a huge cylinder mapped along Z
float map(vec3 p)
{
    float d = 1e10;
    float mat = 0.0;
    
    // Cylinder radius (huge)
    float rad = 100.0;
    
    // Distance to inner surface
    float cyl = rad - length(p.xy);
    
    // Add terrain height (noise wrapped around cylinder)
    // To keep it simple, we project p.xy to polar
    float ang = atan(p.y, p.x);
    vec3 polar = vec3(ang * rad, 0.0, p.z);
    
    float terrain = fbm(polar * 0.05) * 4.0;
    terrain += fbm(polar * 0.2) * 1.0;
    
    float waterLvl = 2.5;
    
    cyl -= max(terrain, waterLvl); // clip terrain at water level
    
    if (cyl < d) {
        d = cyl;
        if (terrain < waterLvl + 0.1) mat = 1.0; // Water
        else mat = 2.0; // Land
    }
    
    // Record city locations (on land, near water)
    float shore = smoothstep(waterLvl + 0.5, waterLvl, terrain);
    float cNoise = hash21(floor(polar.xz * 0.1));
    cityGlow = (mat == 2.0) ? shore * step(0.6, cNoise) * (1.0 - smoothstep(waterLvl, waterLvl + 2.0, terrain)) : 0.0;
    
    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.1, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)));
}

void main()
{
    float cp = (cityP > 0.01 ? cityP : 1.0);
    float clp = (cloudP > 0.01 ? cloudP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 8.0 + audioAdvance * 20.0;
    
    // Camera is flying inside the ring, offset from center
    // We fly at radius 95, so we are 5 units above the ground
    vec3 ro = vec3(0.0, -95.0 + 2.0 * sin(time * 0.2), drift);
    
    // Looking forward, slightly down
    vec3 ta = ro + vec3(0.0, -0.2, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.1);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 100; ++i) {
        p = ro + rd * d;
        float ds = map(p);
        m = hitMat;
        steps = i;
        if (ds < 0.02 * (1.0 + d * 0.02)) break;
        d += ds * 0.8;
        if (d > 300.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.6, 0.7, 0.9) * (0.2 + audioSwell * 0.2); // sky blue base
    
    vec3 sunDir = normalize(vec3(0.0, 0.5, 1.0)); // sun down the center of the cylinder
    vec3 sunCol = vec3(1.0, 0.9, 0.8);
    vec3 cityCol = imgPalette(0.8 + 0.1 * audioKick);
    vec3 landCol = imgPalette(0.3);

    if (m > 0.5) {
        vec3 n = calcNormal(p);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        
        vec3 albedo;
        if (m == 1.0) {
            albedo = vec3(0.1, 0.3, 0.5); // water
            // fake waves
            float waves = fbm(p * 2.0 - vec3(0.0, 0.0, time));
            n = normalize(n + vec3(waves * 0.05, 0.0, waves * 0.05));
            dif = max(dot(n, sunDir), 0.0);
            
            // Specular
            float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 32.0);
            col = albedo * (0.2 + dif * sunCol) + spec * sunCol * 0.5;
        } else {
            albedo = mix(vec3(0.2, 0.4, 0.2), landCol, 0.5); // land
            col = albedo * (0.2 + dif * sunCol) + albedo * fill * 0.2;
            
            // City lights
            float localGlow = cityGlow * cp;
            if (localGlow > 0.0) {
                float pulse = step(0.5, hash21(floor(p.xz * 5.0) + floor(time * 4.00)));
                col += cityCol * localGlow * (0.5 + pulse * 1.5 * audioKick) * 2.0;
            }
        }
        
        col *= clamp(1.0 - float(steps) * 0.01, 0.4, 1.0);
    }
    
    // Volumetric clouds inside the cylinder
    float cloud = fbm(ro + rd * min(d, 100.0) * 0.05 + vec3(0.0, 0.0, time * 0.5));
    cloud = smoothstep(0.4, 0.8, cloud) * clp;
    col = mix(col, vec3(0.9, 0.9, 1.0) * (0.5 + audioSwell * 0.5), cloud * 0.6);
    
    // Atmospheric scattering (curves up into sky)
    float atm = 1.0 - exp(-d * 0.005);
    col = mix(col, vec3(0.4, 0.6, 0.9) * (0.5 + audioSwell * 0.5), atm);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
