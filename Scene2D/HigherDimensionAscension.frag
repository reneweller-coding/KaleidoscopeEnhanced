#version 330 core
out vec4 fragColor;
/**
 * @file HigherDimensionAscension.frag
 * @brief HIGHER DIMENSION ASCENSION: Breaking through the veil of 3D space 
 * into a mind-bending 4D reality. Geometry folds into itself in impossible ways, 
 * constantly shifting and morphing. Audio kicks cause sudden dimensional shifts 
 * and structural reconfigurations.
 *   audioAdvance -> continuous folding of the higher-dimensional geometry
 *   audioKick    -> intense structural shifts and color inversions
 *   audioSwell   -> blinding, divine glow of the higher plane
 *   audioChromaHue-> palette offset for the impossible colors
 *
 * Per-activation variety:
 *   foldP float complexity of the dimensional folds (0.5..1.5)
 *   glowP float intensity of the divine light (0.5..2.0)
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

uniform float foldP;
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

// 4D Rotation matrix (using time) to create tesseract-like folding
vec3 rotate4D(vec3 p, float t) {
    // Fake a 4D rotation by translating and rotating back and forth
    float c = cos(t);
    float s = sin(t);
    // XY rotation
    vec3 p1 = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
    // XZ rotation
    vec3 p2 = vec3(p1.x * c - p1.z * s, p1.y, p1.x * s + p1.z * c);
    return p2;
}

void main()
{
    float fp = (foldP > 0.01 ? foldP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    // We create a fractal structure (like a Mandelbox or similar folding geometry)
    // to represent the higher dimension.
    
    vec3 col = vec3(0.0);
    
    vec3 lightCol = imgPalette(0.8 + audioCentroid * 0.2); // Blinding divine light
    vec3 darkCol = imgPalette(0.2); // Deep structural shadows
    
    float t = time * 0.2 + audioAdvance * 0.5;
    
    vec3 ro = vec3(0.0, 0.0, -3.0);
    vec3 rd = normalize(vec3(uv, 1.0));
    
    // Smooth camera drift
    float camRot = sin(t * 0.5) * 0.5;
    mat2 rotM = mat2(cos(camRot), -sin(camRot), sin(camRot), cos(camRot));
    rd.xy = rotM * rd.xy;
    
    float d = 0.0;
    vec3 p;
    float iter = 0.0;
    float minDist = 100.0; // Keep track of closest approach for glow
    
    for (int i = 0; i < 60; ++i) {
        p = ro + rd * d;
        
        // Audio kick structural shift
        // Shift the geometry suddenly based on kicks
        float shift = sin(floor(time * 1.25)) * audioKick * 0.5;
        
        // 4D Folding space
        vec3 pFold = p;
        
        // Rotate in fake 4D
        pFold = rotate4D(pFold, t * 0.5 + shift);
        
        // Space folding (absolute value folding)
        for(int j = 0; j < 4; j++) {
            pFold = abs(pFold) - vec3(0.5, 0.5, 0.5) * fp;
            pFold = rotate4D(pFold, t * 0.2 * float(j+1));
        }
        
        // Distance function (a lattice of intersecting beams)
        float d1 = length(pFold.xy) - 0.05;
        float d2 = length(pFold.xz) - 0.05;
        float d3 = length(pFold.yz) - 0.05;
        
        float distToStruct = min(min(d1, d2), d3);
        
        minDist = min(minDist, distToStruct);
        
        if (distToStruct < 0.01) {
            // Hit the structure
            iter = float(i) / 60.0;
            break;
        }
        
        d += distToStruct * 0.5; // slow stepping for accuracy in folded space
        
        if (d > 10.0) break;
    }
    
    if (d < 10.0) {
        // Hit surface
        float depth = d / 10.0;
        
        // Color based on depth and iteration count (complexity of fold)
        vec3 surfaceCol = mix(lightCol, darkCol, depth);
        
        // Flashes on structure
        float flash = step(0.9, sin(iter * 100.0 + time * 10.0)) * audioKick * gp;
        
        col = surfaceCol * (1.0 - iter) * (1.0 + audioSwell * 2.0 + flash);
    }
    
    // Intense volumetric glow filling the space
    // Based on how close the ray got to the folded structures
    float glow = exp(-minDist * 15.0) * gp;
    col += lightCol * glow * 0.5 * (1.0 + audioSwell);
    
    // Overall ambient light of the higher dimension
    col += lightCol * 0.1 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
