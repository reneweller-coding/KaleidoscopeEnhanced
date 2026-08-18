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

    // Radius and angle of the particle vortex
    float radius = 5.0 + r1 * 45.0 + audioSwell * 12.0;
    float angle  = r2 * 6.2831853 + time * (0.3 + r3 * 0.5) + audioAdvance * 0.4;
    float height = (r3 - 0.5) * 60.0 + sin(time * 0.5 + r1 * 20.0) * 4.0;

    // Radial kick explosion impulse towards lens
    float impulse = audioKick * exp(-abs(r1 - 0.5) * 4.0) * 15.0;
    radius += impulse;

    vec3 world = vec3(
        cos(angle) * radius,
        height,
        15.0 + sin(angle) * radius + r4 * 10.0
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

    // Dynamic particle color spectrum
    vec3 baseCol = imgPalette(0.30 * r2) * 1.4;
    baseCol = hueRot(baseCol, audioChromaHue + r3 * 1.5);

    float alpha = clamp(1.0 - vp.z / 90.0, 0.0, 1.0) * (0.6 + 0.4 * audioLevel);
    vCol = vec4(baseCol * (2.5 + audioKick * 2.0), alpha);
}
