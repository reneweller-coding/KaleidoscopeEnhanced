#version 330 core
/**
 * @file CosmicBoidsVortex.vert
 * @brief Vertex stage companion to CosmicBoidsVortex.frag -- see that file's header for
 * this scene's description.
 */
// CosmicBoidsVortex.vert — Full-screen 3D particle swarm vortex.
// Thousands of particles swirling in a massive 3D vortex surrounding the camera.
//   audioKick       -> explosive radial impulse pushing particles towards the camera lens
//   audioAdvance    -> vortex spin velocity & Z-drift
//   audioSwell      -> vortex radius expansion
//   audioChromaHue  -> particle color spectrum shift

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBeatPhase;
uniform float audioBeatDecay;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
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

void main() {
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The vortex is a tube around the VIEW axis, with the camera inside it.
    // It used to be a ring in the XZ plane, radius 5..50, centred 15 units ahead:
    // a particle is only on screen while |x| < 0.93*z, so with x = cos(a)*radius
    // and z = 15 + sin(a)*radius the overwhelming majority of the swarm sat far
    // outside the frustum (and a further ~30% was culled behind the near plane by
    // the vp.z < 0.3 test). What survived was a sparse, dark arc -- measured luma
    // 0.011 on a mostly black frame, which is not the "vortex surrounding the
    // camera" the header describes.
    float radius = (1.6 + r1 * r1 * 13.5) * (1.0 + 0.22 * audioSwell);
    float angle  = r2 * 6.2831853 + time * (0.30 + r3 * 0.5) + audioAdvance * 0.4;

    // Radial kick explosion impulse
    float impulse = audioKick * exp(-abs(r1 - 0.5) * 4.0) * 2.6;
    radius += impulse;

    // Streaming down the tube. Each particle wraps individually at the far end,
    // where its own alpha has already faded to zero, so no frame-wide jump.
    const float Z_LEN = 74.0;
    float zDrift = fract(r4 + time * 0.045 + audioAdvance * 0.05) * Z_LEN + 0.7;

    vec3 world = vec3(
        cos(angle) * radius,
        sin(angle) * radius + (r3 - 0.5) * 3.0,
        zDrift
    );

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    if (vp.z < 0.3) {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
    }

    // Dynamic point size scaling for full-screen coverage
    float px = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(180.0 * (0.5 + 0.8 * r4) * px / dist, 2.0, 24.0 * px)
                 * (1.0 + 0.8 * audioKick);

    // Dynamic particle color spectrum. Depth tint keeps near sparks hot and the
    // far end of the tube cool, so the swarm has real range instead of one tone.
    vec3 baseCol = imgPalette(0.30 * r2) * 1.4;
    baseCol = hueRot(baseCol, audioChromaHue + r3 * 1.5);
    float near = exp(-vp.z * 0.055);
    baseCol *= 0.40 + 1.25 * near;

    // Fade in at the mouth and out at the far end: the far fade is what hides the
    // per-particle wrap of zDrift.
    float alpha = smoothstep(0.0, 5.0, vp.z)
                * clamp(1.0 - vp.z / Z_LEN, 0.0, 1.0)
                * (0.6 + 0.4 * audioLevel);
    vCol = vec4(baseCol * (2.0 + audioKick * 1.6), alpha);
}
