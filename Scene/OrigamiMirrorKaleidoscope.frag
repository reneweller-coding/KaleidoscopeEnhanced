#version 330 core
out vec4 fragColor;
// OrigamiMirrorKaleidoscope.frag
// -----------------------------------------------------------------------
// ORIGAMI MIRROR KALEIDOSCOPE: 100% viewport-filling 3D kinetic Miura-ori
// origami tessellation where every triangular mirror facet reflects dynamic
// sections of the photo with angle-dependent chromatic dispersion and
// audio-reactive mechanical folding kinematics.
// -----------------------------------------------------------------------

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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float foldP;
uniform float scaleP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float scl = (scaleP > 0.0) ? scaleP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Miura-ori origami grid coordinates
    vec2 p = uv * 6.0 * scl + vec2(t * 0.5, t * 0.3);
    vec2 cell = floor(p);
    vec2 f = fract(p) - vec2(0.5);

    // Diagonal fold lines: alternating triangular facets
    float isEvenRow = mod(cell.y, 2.0);
    float diag = (isEvenRow > 0.5) ? (f.x + f.y) : (f.x - f.y);
    float facetID = (diag > 0.0) ? 1.0 : -1.0;

    // Folding kinematics angle (Miura-ori dihedral angle alpha)
    float foldAngle = (0.5 + 0.35 * sin(audioPhase * 0.8 + t)) * fld;
    foldAngle += audioKick * 0.4; // Snap fold on kick

    // 3D Surface normal of the folding facet
    float nx = f.x * foldAngle * facetID;
    float ny = f.y * foldAngle * facetID;
    float nz = sqrt(max(1.0 - nx * nx - ny * ny, 0.05));
    vec3 normal = normalize(vec3(nx, ny, nz));

    // Reflected ray vector (viewer looks along -Z)
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 ref = reflect(-viewDir, normal);

    // Photo texture reflection with multi-channel chromatic dispersion
    vec2 baseUV = cell * 0.15 + ref.xy * 0.4;
    vec2 dispR = baseUV + ref.xy * 0.015;
    vec2 dispG = baseUV;
    vec2 dispB = baseUV - ref.xy * 0.015;

    vec3 photoR = img(fract(dispR));
    vec3 photoG = img(fract(dispG));
    vec3 photoB = img(fract(dispB));
    vec3 photoMirror = vec3(photoR.r, photoG.g, photoB.b);

    // Origami crease shadow and edge glints
    float creaseX = abs(abs(f.x) - 0.5);
    float creaseY = abs(abs(f.y) - 0.5);
    float creaseDiag = abs(diag);
    float creaseLine = min(min(creaseX, creaseY), creaseDiag);
    float creaseShadow = smoothstep(0.0, 0.04, creaseLine);

    // Specular highlight on folded mirror facets
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 32.0);

    // Shading composition
    vec3 mirrorBase = photoMirror * (0.8 + 0.5 * audioLevel);
    vec3 col = mirrorBase * (0.4 + 0.6 * creaseShadow);
    col += vec3(1.0, 0.95, 0.85) * spec * (1.2 + 2.0 * audioHigh);

    // Crease laser line on kick
    float laserCrease = exp(-creaseLine * 30.0) * audioKick * 2.0;
    col += vec3(0.2, 0.8, 1.0) * laserCrease;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
