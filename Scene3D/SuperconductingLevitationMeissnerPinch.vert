#version 330 core
/**
 * @file SuperconductingLevitationMeissnerPinch.vert
 * @brief Vertex stage companion to SuperconductingLevitationMeissnerPinch.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vMeissnerGlow;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float diskScaleP;
uniform float levitateDistP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Meissner-Ochsenfeld magnetic levitation geometry: YBCO superconductor disk + levitating magnet
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float scale = (diskScaleP > 0.01 ? diskScaleP : 1.3) * (0.85 + 0.35 * audioSwell);
    
    // Disk base (y < 0) vs levitating permanent magnet bowl (y > 0)
    float isMagnet = smoothstep(-0.2, 0.2, uv.y);
    
    float diskR = 1.0 * (1.0 - isMagnet);
    float magnetR = 0.45 * isMagnet;
    float r = diskR + magnetR;
    
    // Magnetic levitation gap
    float levGap = (levitateDistP > 0.01 ? levitateDistP : 0.8) + sin(t * 2.0) * 0.1;
    float zPos = isMagnet * levGap - (1.0 - isMagnet) * 0.3;
    
    // Curved magnetic flux expulsion pinch field lines between magnet and disk
    float pinchDist = abs(length(uv) - 0.5);
    float fluxPinch = exp(-pinchDist * 16.0) * (1.0 + 3.5 * audioKick);
    vMeissnerGlow = fluxPinch;
    
    // Levitation axis on Y (magnet floats ABOVE the disk in frame) -- on
    // z the gap pointed into the view depth and the tilt below parked
    // the pair under the frame.
    vec3 worldPos = vec3(
        r * cos(u),
        zPos + (1.0 - isMagnet) * sin(u * 6.0) * 0.02,
        r * sin(u)
    ) * scale;

    vNormal = normalize(vec3(0.0, isMagnet * 2.0 - 1.0, 0.0));

    vCol = imgPalette(fract(r * 0.3 + isMagnet * 0.5 + audioCentroid));

    // Camera Transform (V3): tilt BEFORE the translate (after it, the
    // fixed tilt swings the scene centre down by sin(tilt)*4.5).
    vec3 vp = worldPos;
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
