#version 330 core
out vec4 fragColor;
/**
 * @file MultiverseBubbles.frag
 * @brief MULTIVERSE BUBBLES: Floating in the higher-dimensional 'bulk', we see 
 * countless other universes drifting like massive, glowing bubbles. When they 
 * collide, catastrophic flashes of energy bridge the voids between them, syncing 
 * to the audio kicks.
 *   audioAdvance -> slow drift through the bulk
 *   audioKick    -> flashes when universes bump into each other
 *   audioSwell   -> ambient brightness of the multiverse
 *   audioChromaHue-> palette offset for the bulk space
 *
 * Per-activation variety:
 *   bubbleP float density and number of universes (0.5..1.5)
 *   bulkP float brightness of the higher-dimensional space (0.5..2.0)
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

uniform float bubbleP;
uniform float bulkP;
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
    float bp = (bubbleP > 0.01 ? bubbleP : 1.0);
    float bkp = (bulkP > 0.01 ? bulkP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.1 + audioAdvance * 0.2;
    vec3 ro = vec3(drift, 0.0, drift);
    
    // Smooth camera rotation
    float rot = sin(time * 0.1) * 0.2;
    mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    vec2 ruv = rotM * uv;
    vec3 rd = normalize(vec3(ruv, 1.0));
    
    vec3 col = vec3(0.0);
    
    vec3 bulkColor = imgPalette(0.1); // Deep, weird color for the bulk
    vec3 bubbleColor = imgPalette(0.8 + audioCentroid * 0.1); // Bright edge of universes
    
    // Background bulk (higher dimensional fluid/fog)
    float bulkFog = fbm(vec3(uv * 2.0, drift * 0.5));
    col += bulkColor * bulkFog * 0.5 * bkp * (1.0 + audioSwell);
    
    // Raymarching spheres (Universes)
    float d = 0.0;
    vec3 p;
    float densityAccum = 0.0;
    
    // Domain repetition for bubbles
    float cellSize = 3.0 / bp;
    
    for (int i = 0; i < 40; ++i) {
        p = ro + rd * d;
        
        vec3 cellP = p / cellSize;
        vec3 iCell = floor(cellP);
        vec3 fCell = fract(cellP) - 0.5; // -0.5 to 0.5
        
        float cellHash = hash11(iCell.x * 12.3 + iCell.y * 45.6 + iCell.z * 78.9);
        
        // Randomize bubble position within cell
        vec3 offset = vec3(
            hash11(cellHash) - 0.5,
            hash11(cellHash + 1.0) - 0.5,
            hash11(cellHash + 2.0) - 0.5
        ) * 0.5;
        
        // Random radius
        float radius = 0.2 + 0.3 * hash11(cellHash + 3.0);
        
        // Calculate distance to this sphere
        vec3 localP = fCell - offset;
        float distToCenter = length(localP);
        float distToSphere = distToCenter - radius;
        
        // We only render the *surface* of the bubble (the membrane)
        float membrane = abs(distToSphere);
        
        if (membrane < 0.05) {
            float alpha = smoothstep(0.05, 0.0, membrane) * 0.3;
            
            // Inside the bubble is another universe (different fbm pattern)
            float inside = fbm(p * 5.0 + cellHash * 100.0);
            
            // The membrane glows
            vec3 localCol = bubbleColor * (0.5 + inside * 0.5);
            
            // Universes bumping into each other causing flashes
            // We use cellHash to trigger random flashes
            float collision = step(0.95, hash11(cellHash * 10.0 + floor(time * 5.0)));
            localCol += bubbleColor * collision * audioKick * 5.0 * bkp;
            
            // Fresnel effect for the bubble (brighter on edges)
            // We approximate normal based on localP
            vec3 normal = normalize(localP);
            float fresnel = 1.0 - max(0.0, dot(normal, -rd));
            fresnel = pow(fresnel, 3.0);
            
            localCol += vec3(1.0) * fresnel * (1.0 + audioSwell);
            
            col += localCol * alpha * (1.0 - densityAccum);
            densityAccum += alpha;
            
            if (densityAccum > 0.95) break;
        }
        
        // Advance ray
        // Safe step size to not miss thin membranes
        d += max(0.02, abs(distToSphere) * 0.5); 
        if (d > 15.0) break;
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
