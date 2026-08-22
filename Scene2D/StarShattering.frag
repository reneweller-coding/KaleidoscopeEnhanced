#version 330 core
out vec4 fragColor;
/**
 * @file StarShattering.frag
 * @brief STAR SHATTERING: A massive star is being violently ripped apart by 
 * a rogue black hole. Stellar material is violently siphoned off into an 
 * accretion disk, causing the star to shatter and explode with the audio.
 *   audioAdvance -> speed of the material being sucked into the black hole
 *   audioKick    -> catastrophic explosions on the star's surface
 *   audioSwell   -> blinding brightness of the dying star
 *   audioChromaHue-> palette offset for the stellar plasma
 *
 * Per-activation variety:
 *   gravityP float strength of the black hole's pull (0.5..1.5)
 *   shatterP float intensity of the star's surface destruction (0.5..2.0)
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

uniform float gravityP;
uniform float shatterP;
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

// Gravitational lensing distortion
vec2 lens(vec2 uv, vec2 center, float mass) {
    vec2 dir = uv - center;
    float d = length(dir);
    if(d == 0.0) return uv;
    // Deflection angle approx
    float deflection = mass / max(d, 0.01);
    return uv - normalize(dir) * deflection;
}

void main()
{
    float gp = (gravityP > 0.01 ? gravityP : 1.0);
    float sp = (shatterP > 0.01 ? shatterP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    vec3 starColor = imgPalette(0.8 + audioCentroid * 0.1);
    vec3 darkPlasma = vec3(0.05, 0.0, 0.1); // Exposed darker core layers
    
    // Positions
    vec2 starPos = vec2(-0.4, 0.0);
    vec2 bhPos = vec2(0.5, 0.0);
    
    // Apply gravitational lensing to the whole scene from the black hole
    float bhMass = 0.05 * gp;
    vec2 lensedUv = lens(uv, bhPos, bhMass);
    
    // 1. The Black Hole
    float dBh = length(uv - bhPos);
    float eventHorizon = 0.1 * gp;
    
    // 2. The Star
    float dStar = length(lensedUv - starPos);
    
    // The star is being deformed towards the black hole (Roche lobe overflow)
    // We stretch the distance function towards the BH
    vec2 toBh = normalize(bhPos - starPos);
    vec2 fromStar = lensedUv - starPos;
    
    // Teardrop distortion
    float stretch = max(0.0, dot(normalize(fromStar), toBh));
    float starDistorted = dStar * (1.0 - stretch * 0.4 * gp);
    
    float starRad = 0.5;
    
    if (starDistorted < starRad) {
        // We are on the star surface
        // Map 2D to fake 3D sphere
        float z = sqrt(max(0.0, starRad * starRad - starDistorted * starDistorted));
        vec3 p3 = vec3(fromStar, z);
        
        // Rotation
        p3.xy = mat2(cos(time*0.1), -sin(time*0.1), sin(time*0.1), cos(time*0.1)) * p3.xy;
        
        // Star surface texture
        float surface = fbm(vec3(p3 * 5.0 + vec3(0.0, time * 0.5 + audioAdvance, 0.0)));
        
        // The side facing the BH is shattering/exploding
        float shatterZone = stretch; // 0 on back, 1 on front facing BH
        
        // vec3(p3*10.0, time*2.0) was a vec3 + a float = 4 components into a
        // 3-component constructor (GLSL error C1068). Animate along z instead.
        float shatterNoise = fbm(p3 * 10.0 + vec3(0.0, 0.0, time * 2.0));
        float crack = smoothstep(0.6 - shatterZone * 0.4 * sp, 1.0, shatterNoise);
        
        // Violent kick explosions tearing chunks out of the star
        float explosion = step(0.9, hash11(floor(p3.x * 5.0) + floor(time * 8.0))) * shatterZone;   // was 10 Hz
        
        vec3 surfaceCol = mix(starColor * (0.5 + surface * 0.5), darkPlasma, crack * 0.8);
        surfaceCol += starColor * explosion * audioKick * 5.0 * sp;
        
        // Limb darkening
        float limb = smoothstep(starRad, starRad - 0.1, starDistorted);
        col += surfaceCol * limb * (1.0 + audioSwell * 0.5);
    }
    
    // 3. The Accretion Stream (Siphoned material)
    // Stream of plasma from the tip of the star into the black hole
    
    // Distance from the line connecting star and BH
    // Using unlensed UV for the plasma stream looks better
    vec2 streamDir = toBh;
    vec2 perpDir = vec2(-streamDir.y, streamDir.x);
    
    vec2 pStream = uv - starPos;
    float distAlongStream = dot(pStream, streamDir);
    float distFromStream = abs(dot(pStream, perpDir));
    
    float streamLen = length(bhPos - starPos);
    
    if (distAlongStream > 0.0 && distAlongStream < streamLen) {
        // The stream narrows as it gets closer to the BH, but is chaotic
        float normalizedDist = distAlongStream / streamLen;
        
        float streamWobble = fbm(vec3(normalizedDist * 10.0, time * 2.0, 0.0)) * 0.1;
        float actualDistFromStream = abs(distFromStream - streamWobble);
        
        float streamWidth = 0.15 * (1.0 - normalizedDist) * gp;
        
        if (actualDistFromStream < streamWidth) {
            // Rushing plasma
            float speed = time * 10.0 + audioAdvance * 20.0;
            float plasmaNoise = fbm(vec3(distFromStream * 20.0, distAlongStream * 10.0 + speed, time));
            
            // Brightness increases as it gets sucked in
            float heat = pow(normalizedDist, 2.0);
            
            // Audio kicks create massive pulses traveling down the stream
            float pulse = step(0.9, fract(distAlongStream * 5.0 - speed * 0.5));
            
            float core = smoothstep(streamWidth, 0.0, actualDistFromStream) * plasmaNoise;
            
            vec3 streamCol = starColor * core * (1.0 + heat * 5.0) * gp;
            streamCol *= (1.0 + pulse * audioKick * 5.0 * sp);
            
            col += streamCol * (1.0 + audioSwell);
        }
    }
    
    // 4. Black Hole Accretion Disk & Event Horizon
    if (dBh < eventHorizon) {
        col = vec3(0.0); // Black hole core
    } else {
        // Accretion disk orbiting the BH
        float angleBh = atan(uv.y - bhPos.y, uv.x - bhPos.x);
        float diskSpeed = time * 5.0 + audioAdvance * 5.0;
        
        float diskNoise = fbm(vec3(angleBh * 10.0 + diskSpeed, dBh * 20.0, time));
        
        // Disk falls off quickly
        float diskMask = exp(-(dBh - eventHorizon) * (30.0 / gp));
        
        col += starColor * diskNoise * diskMask * 3.0 * (1.0 + audioSwell) * gp;
        
        // Event horizon photon ring (bright thin edge)
        float photonRing = exp(-abs(dBh - eventHorizon * 1.1) * 100.0);
        col += starColor * photonRing * 5.0 * gp;
    }
    
    // Background stars (lensed)
    if (starDistorted >= starRad && dBh >= eventHorizon) {
        float bg = hash11(dot(floor(lensedUv * 200.0), vec2(12.3, 45.6)));
        if (bg > 0.99) col += vec3(1.0) * (0.1 + audioSwell * 0.1);
    }
    
    // Glare from the dying star
    float starGlare = exp(-dStar * 2.0);
    col += starColor * starGlare * 0.3 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
