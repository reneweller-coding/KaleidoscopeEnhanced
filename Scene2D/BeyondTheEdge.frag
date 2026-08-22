#version 330 core
out vec4 fragColor;
/**
 * @file BeyondTheEdge.frag
 * @brief BEYOND THE EDGE: Looking past the absolute edge of the observable 
 * universe into the Cosmic Microwave Background and the true unknown. The CMB 
 * ripples gently in ancient patterns, while audio kicks create massive, glowing 
 * anomalies that tear through the cosmic horizon.
 *   audioAdvance -> slow panning across the cosmic horizon
 *   audioKick    -> massive, glowing anomalies piercing the CMB
 *   audioSwell   -> ambient brightness of the primordial radiation
 *   audioChromaHue-> palette offset for the CMB mapping
 *
 * Per-activation variety:
 *   cmbP float contrast and detail of the cosmic microwave background (0.5..1.5)
 *   anomalyP float intensity of the unknown anomalies (0.5..2.0)
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

uniform float cmbP;
uniform float anomalyP;
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
    for(int i = 0; i < 6; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float cp = (cmbP > 0.01 ? cmbP : 1.0);
    float ap = (anomalyP > 0.01 ? anomalyP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    // Slow drift across the sky
    float drift = time * 0.05 + audioAdvance * 0.1;
    
    // Map UV to a spherical projection (Mollweide-like or just distorted)
    // to give it that "all-sky map" feel.
    float dist = length(uv);
    if (dist > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Spherical coordinates
    float z = sqrt(1.0 - dist * dist);
    vec3 p3 = vec3(uv.x, uv.y, z);
    
    // Rotate sphere
    float rot = drift;
    mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    p3.xz = rotM * p3.xz;
    
    // 1. The Cosmic Microwave Background
    // It's a combination of low-frequency and high-frequency noise
    
    // Low frequency temperature fluctuations
    float cmbBase = fbm(p3 * 3.0);
    
    // High frequency details
    float cmbDetail = fbm(p3 * 15.0);
    
    // Combine
    float cmb = mix(cmbBase, cmbDetail, 0.3) * cp;
    
    // Map the CMB value (0.0 to 1.0) to a false-color palette
    // Traditionally CMB maps go from dark blue (cold) to bright red/yellow (hot)
    // We use the imgPalette but sample it across the noise value
    vec3 cmbColor = imgPalette(cmb * 0.8 + 0.1);
    
    vec3 col = cmbColor * (0.3 + audioSwell * 0.2);
    
    // 2. The Unknown Anomalies
    // Massive, glowing tears in the fabric of the CMB, triggered by kicks
    // These represent things outside our universe interacting with the boundary
    
    // Create random hotspots on the sphere
    vec3 cellP = p3 * 4.0;
    vec3 iCell = floor(cellP);
    float cellHash = hash11(iCell.x * 12.3 + iCell.y * 45.6 + iCell.z * 78.9);
    
    if (cellHash > 0.7) {
        // Center of the anomaly in this cell
        vec3 center = iCell + vec3(0.5);
        float dToCenter = length(cellP - center);
        
        // Flash based on kick
        float trigger = step(0.95, hash11(cellHash * 10.0 + floor(time * 5.0)));
        float flash = trigger * audioKick * 5.0 * ap;
        
        // Shape of the anomaly (like a glowing fracture)
        float fracture = fbm(p3 * 20.0 + time);
        float mask = smoothstep(0.4, 0.0, dToCenter) * fracture;
        
        // Pure white/intense energy piercing through
        vec3 anomalyCol = imgPalette(0.9 + audioCentroid * 0.1);
        
        col += anomalyCol * mask * flash * (1.0 + audioSwell);
        
        // Glare spreading across the CMB
        float glare = exp(-dToCenter * 5.0) * flash * 0.5;
        col += anomalyCol * glare;
    }
    
    // Edge darkening for the spherical map projection
    float edge = smoothstep(1.0, 0.95, dist);
    col *= edge;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
