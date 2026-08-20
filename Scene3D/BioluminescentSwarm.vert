#version 330 core
/**
 * @file BioluminescentSwarm.vert
 * @brief Vertex stage companion to BioluminescentSwarm.frag -- see that file's header for
 * this scene's description.
 */
// BioluminescentSwarm.vert — Indirect render pass for compute boids
//
// Two primitive families arrive, told apart by attrB.w (the glow slot): the
// creatures (glow >= 0) and the marine-snow motes that fill the water behind
// them (glow = -1, with seeds in attrA.xyz and the quad corner in attrB.xy).
// The snow is placed HERE, in FRUSTUM coordinates -- x and y scaled by depth
// -- because only this stage knows the aspect ratio, and being frustum-laid
// is exactly what keeps it evenly spread over the picture at every distance.
in vec4 attrA; // xyz = world pos (or snow seeds), w = hue
in vec4 attrB; // xyz = normal (or quad corner + size seed), w = glow / -1

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float audioAdvance;
uniform float audioSwell;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4 vCol;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vQuad;      // marine-snow mote's quad coordinate
out float vSnow;     // 0 = creature, 1 = marine snow

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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 worldP = attrA.xyz;
    float hue = attrA.w;
    vec3 norm = attrB.xyz;
    float glow = attrB.w;

    if (glow < -0.5)
    {
        // ---- MARINE SNOW -----------------------------------------------
        // Laid out straight in VIEW space: the camera orbits, and snow that
        // hangs still relative to the eye is exactly what drifting particulate
        // in the water column looks like.
        // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
        const float kTanY = 0.5206;
        float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

        float hx = attrA.x, hy = attrA.y, hz = attrA.z, hsz = attrB.z;

        // Kept behind the swarm's farthest reach, so an opaque mote can never
        // punch a dim disc through a creature.
        float dz = 60.0 + hz * 100.0;
        float ph = hx * 6.2831853 + time * 0.05 + audioAdvance * 0.04;

        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vec3 c = vec3((hx - 0.5) * open * dz * kTanY * aspect + 2.6 * cos(ph),
                      (hy - 0.5) * open * dz * kTanY          + 2.6 * sin(ph * 0.79),
                      dz);
        // Grows with depth so its ON-SCREEN size stays roughly constant; below
        // about 2.5 px a mote averages away and the far water reads black.
        float sz = (0.022 + 0.030 * hsz) * dz;

        vec3 snowP = c + vec3((attrB.xy * 2.0 - 1.0) * sz, 0.0);
        vec3 sp = snowP;
        sp.x -= eyeOff;
        gl_Position = projM * vec4(sp.x, sp.y, -sp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;

        vec3 snowCol = palTint(vec3(0.35, 0.80, 0.85), 0.55, 0.35)
                     * (0.035 + 0.115 * fract(hsz * 7.31 + hx * 3.17))
                     * (0.75 + 0.5 * audioSwell)
                     * clamp(1.0 - dz / 210.0, 0.0, 1.0);
        float h2 = (hueP > 0.0) ? hueP : 0.0;
        if (h2 > 0.001) snowCol = hueRot(snowCol, h2);

        vCol    = vec4(min(max(snowCol, vec3(0.0)), vec3(1.0)), 1.0);
        vNormal = vec3(0.0, 0.0, 1.0);
        vWorld  = snowP;
        vQuad   = attrB.xy;
        vSnow   = 1.0;
        return;
    }

    vQuad = vec2(0.5);
    vSnow = 0.0;

    // Orbiting Camera
    float camAngle = time * 0.12 + audioAdvance * 0.04;
    float camDist = 28.0 - audioSwell * 5.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 12.0 + 3.0 * sin(time * 0.15), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Bioluminescent spectral color
    vec3 boidCol = palTint(mix(vec3(0.0, 1.0, 0.8), vec3(0.9, 0.1, 1.0), hue), 0.30 * hue, 0.28);
    boidCol = mix(boidCol, vec3(1.0, 0.9, 0.2), glow * 0.3);

    float h = (hueP > 0.0) ? hueP : 0.0;
    if (h > 0.001) boidCol = hueRot(boidCol, h);

    vCol = vec4(boidCol * glow, 1.0);
    vNormal = norm;
    // CAMERA-RELATIVE, not world-absolute. The fragment stage builds its view
    // direction as normalize(-vWorld), which is only the direction back to the
    // eye if the origin IS the eye -- with the camera orbiting 28 units out it
    // was pointing at the swarm's centre instead, so the specular term answered
    // to the wrong geometry entirely. It also lets the fragment stage read a
    // true distance-to-camera for depth shading.
    vWorld = relP;
}
