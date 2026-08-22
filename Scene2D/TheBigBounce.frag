#version 330 core
out vec4 fragColor;
/**
 * @file TheBigBounce.frag
 * @brief THE BIG BOUNCE: The end and the beginning. The entire universe 
 * collapses rapidly into an infinitely dense, blinding singularity, only to 
 * violently explode outward again in a new Big Bang, driven by the audio kicks.
 *   audioAdvance -> chaotic movement of the primordial plasma
 *   audioKick    -> triggers the catastrophic collapse and subsequent explosion
 *   audioSwell   -> blinding brightness of the singularity
 *   audioChromaHue-> palette offset for the newborn universe
 *
 * Per-activation variety:
 *   bounceP float intensity and speed of the collapse/expansion (0.5..1.5)
 *   plasmaP float density of the primordial plasma (0.5..2.0)
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

uniform float bounceP;
uniform float plasmaP;
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
    float bp = (bounceP > 0.01 ? bounceP : 1.0);
    float pp = (plasmaP > 0.01 ? plasmaP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    vec3 hotColor = imgPalette(0.8 + audioCentroid * 0.1); // White/hot center
    vec3 coolColor = imgPalette(0.3); // Edge expanding gas
    
    // The "Bounce" state
    // We use a continuous time function that snaps violently to 0 on audioKick
    // We approximate this by creating a cyclic expansion/collapse based on time and kick
    
    // A cyclic variable that represents the scale of the universe
    // 0 = singularity, >0 = expanded
    float cycleTime = time * 2.0 * bp;
    // We want it to suddenly snap to 0 when there's a strong kick
    // Since we don't have state, we use hash of time to simulate kicks triggering it
    float kickTrigger = step(0.9, hash11(floor(time * 5.0))) * audioKick;
    
    // Scale of the universe (expands over time, snaps back on trigger)
    float uScale = fract(cycleTime + audioAdvance) + (1.0 - kickTrigger);
    
    // We remap scale so it expands fast, then slows down, then collapses instantly
    // uScale is 0..2
    float expansion = pow(uScale * 0.5, 0.5); // 0.0 to 1.0
    
    // If a kick is happening right now, expansion is near 0 (singularity)
    if (kickTrigger > 0.5) expansion = 0.01;
    
    float dist = length(uv);
    
    // Central Singularity
    float singularity = 0.01 / max(dist, 0.001);
    
    // The expanding front
    float frontRad = expansion * 1.5;
    float frontThickness = 0.1 * bp;
    
    // Inside the universe
    if (dist < frontRad) {
        // Distance from center normalized 0..1
        float normDist = dist / max(frontRad, 0.001);
        
        // Primordial plasma (extremely dense and chaotic near the beginning)
        // Zoom out as it expands
        float zoom = 1.0 / max(expansion, 0.1);
        
        vec3 p3 = vec3(uv * 10.0 * zoom, time + audioAdvance * 5.0);
        float plasma = fbm(p3 * pp);
        
        // Core is intensely hot, edges cool down
        float heat = 1.0 - normDist;
        
        vec3 pCol = mix(coolColor, hotColor, heat * plasma);
        
        // Energy spikes traveling outwards
        float spike = step(0.9, fract(dist * 20.0 - time * 10.0));
        pCol += hotColor * spike * audioSwell * 2.0;
        
        // Dark matter web forming as it cools
        float web = fbm(p3 * 2.0 + 10.0);
        float cooling = smoothstep(0.5, 1.0, expansion); // Only forms later in the cycle
        pCol *= mix(1.0, smoothstep(0.4, 0.6, web), cooling);
        
        col += pCol;
        
        // The edge front (Big Bang shockwave)
        float edge = exp(-abs(dist - frontRad) * (50.0 / bp));
        col += hotColor * edge * 2.0;
        
    } else {
        // Outside the universe (The void / Nothingness)
        // It's completely black, except for the glare of the singularity
        col = vec3(0.0);
    }
    
    // The glaring light of the singularity penetrates everything
    col += hotColor * singularity * (0.1 + audioSwell * 0.5 + kickTrigger * 2.0);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
