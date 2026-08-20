#version 330 core
/**
 * @file RelativisticAccretionTorusMHD.vert
 * @brief Vertex stage companion to RelativisticAccretionTorusMHD.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vDoppler;

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

uniform float torusRadiusP;
uniform float torusThickP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

// ---- Cross-section of the accretion structure ------------------------------
// (rho, h) traced as v runs once around the tube.  For |v| < pi/2 this is the
// plain Polish-donut tube; past that the INNER half of the tube flares
// smoothly outward into the thin, tapering, spiral-corrugated accretion flow
// that feeds it.  One continuous surface, so the grid mesh never has to
// stretch a row of quads between two separate bodies -- and the flow is what
// carries the picture out to its edges instead of leaving the donut as a
// small bright ring in the middle of a black frame.
vec2 crossSection(float v, float u, float R, float r, float Rout, float t)
{
    float s     = min(abs(v) * 0.31830989, 1.0);          // |v| / pi
    float skirt = smoothstep(0.50, 1.0, s);
    float ripple = sin(u * 6.0 - v * 4.0 - t * 3.0) * 0.12;   // MHD turbulence
    float rr  = r * (1.0 + ripple);
    float rho = R + rr * cos(v) + skirt * (Rout - R - rr);
    // sin(v) -> 0 at the seam, so the two skirt sheets close into a tapered
    // outer rim instead of landing on each other and z-fighting.
    float h   = rr * sin(v) * (1.0 - 0.82 * skirt);
    // Spiral density waves warp the flow (and give the outer disc the local
    // shading variation that stops it reading as one flat plate).
    h += skirt * 0.05 * rho * sin(u * 3.0 - rho * 2.0 - t * 1.6);
    return vec2(rho, h);
}

vec3 surfacePos(float u, float v, float R, float r, float Rout, float t)
{
    vec2 c = crossSection(v, u, R, r, Rout, t);
    return vec3(c.x * cos(u), c.x * sin(u), c.y);
}

void main()
{
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Thick magnetohydrodynamic Polish Donut accretion torus
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float R_torus = (torusRadiusP > 0.01 ? torusRadiusP : 1.3);
    float r_tube  = (torusThickP > 0.01 ? torusThickP : 0.65) * (0.85 + 0.3 * audioSwell);
    // Outer edge of the accretion flow, sized against the camera distance
    // below so the flow always reaches the left and right frame edges.
    float R_out = 4.6 + 1.6 * R_torus;

    float su = sin(u);

    vec3 worldPos = surfacePos(u, v, R_torus, r_tube, R_out, t);

    // True geometric normal of whatever the cross-section builds (the analytic
    // torus normal is wrong everywhere on the flared skirt).
    const float du = 0.006, dv = 0.006;
    vec3 pU = surfacePos(u + du, v, R_torus, r_tube, R_out, t);
    vec3 pV = surfacePos(u, v + dv, R_torus, r_tube, R_out, t);
    vNormal = normalize(cross(pU - worldPos, pV - worldPos));

    // Relativistic Doppler beaming factor: g = 1 / (gamma * (1 - v/c * cos(theta)))
    // Material moving towards observer on left side is blueshifted & boosted
    float doppler = -su * 0.45;
    vDoppler = doppler;
    
    // Accretion plasma color, with the radial temperature gradient of a real
    // disc: the inner flow is the hot bright part, the outer flow cools off.
    float rho  = length(worldPos.xy);
    float temp = clamp(1.35 - rho / R_out, 0.0, 1.0);
    vec3 plasmaCol = mix(vec3(1.0, 0.4, 0.1), vec3(0.3, 0.8, 1.0), clamp(doppler + 0.5, 0.0, 1.0))
                   * (0.50 + 0.60 * temp);
    vCol = palTint(plasmaCol, u * 0.15 + audioCentroid, 0.25);
    
    // Camera Transform (V3): tilt BEFORE the translate -- applied after,
    // it swings the scene centre down by sin(tilt)*4.5 and left only the
    // torus rim peeking into the bottom of the frame.
    vec3 vp = worldPos;
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    // 6.5 rather than 4.5: with the flow now reaching R_out the frame is filled
    // from this distance, and the near rim still stays well in front of the
    // camera (6.5 - R_out*sin(tilt) is about 2 units at the widest preset).
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
