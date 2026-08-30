#version 330 core
out vec4 fragColor;
/**
 * @file KardashevTypeIIICity.frag
 * @brief KARDASHEV TYPE III CITY: View of an entire galaxy whose stars have 
 * been interconnected into a colossal, synchronized machine network. The 
 * network pulses and processes data in perfect rhythm to the audio.
 *   audioAdvance -> slow zooming/panning across the galactic machine
 *   audioKick    -> flashes from major star-nodes firing
 *   audioSwell   -> brightness of the connecting energy conduits
 *   audioChromaHue-> palette offset for the galaxy-scale network
 *
 * Per-activation variety:
 *   techP float complexity and density of the network connections (0.5..1.5)
 *   glowP float intensity of the network pulses (0.5..2.0)
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

uniform float techP;
uniform float glowP;
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

void main()
{
    float tp = (techP > 0.01 ? techP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Slow panning and zooming
    float zoom = 1.0 + 0.2 * sin(time * 0.05);
    vec2 p = uv * zoom;
    
    // Rotation of the galaxy
    float rot = time * 0.05 + audioAdvance * 0.2;
    mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    p = rotM * p;
    
    vec3 col = vec3(0.0);
    
    vec3 coreCol = imgPalette(0.8 + audioCentroid * 0.1); // Bright core
    vec3 netCol = imgPalette(0.4); // Network links
    
    // Distance from galactic center
    float dist = length(p);
    float angle = atan(p.y, p.x);
    
    // 1. The underlying galaxy shape (spiral arms)
    // Create a spiral pattern
    float spiral = sin(angle * 2.0 + dist * 5.0 - time * 0.1);
    float armMask = smoothstep(0.0, 1.0, spiral) * exp(-dist * 2.0);
    
    // 2. The Network (Voronoi/Grid hybrid applied to the galaxy shape)
    // We create a web of interconnected lines (conduits between stars)
    float web = 0.0;
    
    // Multi-scale network
    for (int i = 0; i < 3; ++i) {
        float scale = 10.0 + float(i) * 15.0 * tp;
        vec2 gridP = p * scale;
        vec2 cell = floor(gridP);
        vec2 fractP = fract(gridP);
        
        float minDist = 1.0;
        vec2 closestPoint = vec2(0.0);
        float closestHash = 0.0;
        
        // Find closest node
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                vec2 neighbor = vec2(float(x), float(y));
                float h = hash21(cell + neighbor);
                vec2 point = neighbor + 0.5 + 0.4 * vec2(sin(h * 6.28 + time), cos(h * 6.28 + time));
                float d = length(fractP - point);
                
                if (d < minDist) {
                    minDist = d;
                    closestPoint = point;
                    closestHash = h;
                }
            }
        }
        
        // Render network edges (lines between nodes)
        // We approximate this by drawing lines along the edges of the voronoi cells
        float edge = smoothstep(0.1, 0.0, minDist); // just nodes for now
        
        // To draw lines, we use the distance to the second closest point
        float minDist2 = 1.0;
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                vec2 neighbor = vec2(float(x), float(y));
                float h = hash21(cell + neighbor);
                vec2 point = neighbor + 0.5 + 0.4 * vec2(sin(h * 6.28 + time), cos(h * 6.28 + time));
                float d = length(fractP - point);
                
                if (d > minDist && d < minDist2) {
                    minDist2 = d;
                }
            }
        }
        
        // Distance to the boundary between the two closest points (this forms the lines/conduits)
        float borderDist = minDist2 - minDist;
        float lineThick = 0.02 * (1.0 + float(i) * 0.5);
        float lines = smoothstep(lineThick, 0.0, borderDist);
        
        // Mask the lines so they only appear dense within the spiral arms and core
        float densityMask = armMask + exp(-dist * 5.0); // arms + core
        
        // Energy pulsing along the lines
        float pulse = step(0.9, sin(dist * 20.0 - time * 10.0 + closestHash * 10.0));
        
        web += lines * densityMask * (0.5 + pulse * audioKick * 3.0);
        
        // Add the star nodes
        float node = smoothstep(0.1, 0.0, minDist);
        float nodeFlash = step(0.98, hash11(closestHash * 10.0 + floor(time * 4.00)));
        web += node * densityMask * (1.0 + nodeFlash * audioKick * 5.0);
    }
    
    col += netCol * web * gp * (1.0 + audioSwell);
    
    // 3. Galactic Core (Type III civilization central processing unit)
    float coreDist = exp(-dist * 10.0);
    float corePulse = fbm(vec3(p * 20.0, time * 2.0)) * coreDist;
    col += coreCol * corePulse * 5.0 * gp * (1.0 + audioKick);
    
    // Overall ambient glow of the galaxy
    col += coreCol * exp(-dist * 3.0) * 0.1 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
