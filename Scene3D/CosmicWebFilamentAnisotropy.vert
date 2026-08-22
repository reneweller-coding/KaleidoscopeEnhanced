#version 330 core
/**
 * @file CosmicWebFilamentAnisotropy.vert
 * @brief Vertex stage companion to CosmicWebFilamentAnisotropy.frag -- see that file's
 * header for this scene's description.
 *
 * The web used to be a 3.2-radius ball whose brightness ran as exp(-|p|*0.6):
 * everything beyond the middle third was crushed to nothing, so 60k particles
 * lit one small blob in a black frame (occ 0.11).  Density now comes from the
 * distance to the nearest CLUSTER NODE of the lattice instead of from the
 * distance to the camera's origin, the web spans the whole frustum, and a
 * quarter of the particles form a far-field void glow placed in FRUSTUM
 * coordinates so the corners are never empty.
 */

in vec4 attrA; // w = point index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vDensity;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

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

uniform float webScaleP;
uniform float pointSizeP;

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
    float t = time * 0.3 + audioAdvance * 0.25;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    vec3  seed = attrB.xyz;
    float s4   = attrB.w;
    float pIdx = attrA.w;

    vec3  vp;
    float sizeBase, sizeMin, sizeCap;

    if (s4 < 0.25)
    {
        // ---- COSMIC VOID GLOW ----------------------------------------
        // A quarter of the particles spread evenly over the frustum from just
        // behind the web out to the far dark.  Clearly dimmer than the
        // filaments, but bright enough that no tile of the picture is empty.
        float hx = seed.x;
        float hy = seed.y;
        float hz = seed.z;

        float dz = 16.0 + hz * 78.0;
        // The void layer covers the whole frame, so its drift is a large part of
        // the frame-average motion; at t * 0.06 it was 0.018 rad/s, i.e. frozen.
        float ph = hx * 6.2831853 + t * 0.55;

        // 2.0 would fit the frustum exactly; 2.35 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.35;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 1.6 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 1.6 * sin(ph * 0.79),
                  dz);

        vDensity = 0.35 + 0.45 * hy;
        vCol = imgPalette(fract(hz * 0.5 + audioCentroid))
             * (0.42 + 0.52 * hx) * clamp(1.0 - dz / 150.0, 0.22, 1.0);

        // A speck must stay legible at any distance -- below roughly four
        // pixels an additive sprite averages away to nothing and the far
        // field reads as black again.
        sizeBase = 510.4; sizeMin = 4.4; sizeCap = 51.0;
    }
    else
    {
        // ---- THE FILAMENT NETWORK ------------------------------------
        float phi   = seed.x * 6.2831853;
        float theta = seed.y * 3.14159265;
        float ws    = clamp((webScaleP > 0.01 ? webScaleP : 1.0), 0.6, 2.0);
        float r     = pow(seed.z, 0.40) * 6.2 * (0.72 + 0.30 * ws);

        vec3 spherePos = vec3(
            sin(theta) * cos(phi) * r,
            sin(theta) * sin(phi) * r,
            cos(theta) * r
        );

        // Zel'dovich approximation: pancake collapse warps the smooth field.
        vec3 filamentPos = spherePos;
        // Collapse rates up ~2.5x: the Zel'dovich warp is what makes the web
        // flow rather than sit, and at 0.12 rad/s it did not move at all.
        filamentPos.x += sin(spherePos.y * 0.75 + t * 1.00) * 0.9;
        filamentPos.y += sin(spherePos.z * 0.75 + t * 0.78) * 0.9;
        filamentPos.z += sin(spherePos.x * 0.75 + t * 1.25) * 0.9;

        // Collapse each particle onto a FILAMENT: two of the three axes snap
        // toward the nearest node of the supercluster lattice, the third runs
        // free -- so the particles form threads along all three directions,
        // meeting at the nodes.
        const float kLat = 0.40;
        vec3 node  = round(filamentPos * kLat) / kLat;
        vec3 blend = vec3(0.74);
        float axis = floor(seed.x * 2.999);
        if      (axis < 0.5) blend.x = 0.0;
        else if (axis < 1.5) blend.y = 0.0;
        else                 blend.z = 0.0;
        filamentPos = mix(filamentPos, node, blend);

        // Density is the proximity to the CLUSTER NODE, not to the camera:
        // every node across the whole web lights up, not just the middle one.
        float dNode   = length(filamentPos - node);
        float density = exp(-dNode * 0.62) * (0.75 + 0.35 * sin(pIdx * 0.01 + t));
        // A gentle far fade for depth, floored so the outer web never dies.
        density *= clamp(1.0 - length(filamentPos) * 0.045, 0.32, 1.0);
        vDensity = density;

        vCol = imgPalette(fract(density * 0.4 + seed.x * 0.3 + audioCentroid))
             * (0.40 + 0.80 * density);

        sizeBase = 284.3; sizeMin = 2.4; sizeCap = 65.7;

        // Rotation of the whole structure. At t * 0.1 (t itself at 0.3/s) this
        // was 0.03 rad/s -- under two degrees over a whole probe, so the web was
        // a still photograph (measured motion 0.0056). 0.42 gives 0.13 rad/s,
        // still an unhurried drift at 0.02 Hz, but the parallax between near and
        // far filaments now actually reads.
        vec3 rp = filamentPos;
        float c = cos(t * 0.42), s = sin(t * 0.42);
        vp = vec3(rp.x * c - rp.z * s, rp.y, rp.x * s + rp.z * c);
        // Far enough back that the near hemisphere of the web does not reach
        // the near plane: at 8.2 (its own outer radius) those particles landed
        // at z ~ 0 and were culled outright.
        vp.z += 10.5;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Controlled point size: scaled by depth so a distant particle still reads,
    // and capped so a near cluster cannot smear into a white blob.
    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    float gain = (pointSizeP > 0.01 ? pointSizeP : 12.0) / 12.0;
    gl_PointSize = clamp(sizeBase * gain * (0.6 + 0.5 * vDensity) * px / dist
                         + min(audioKick * 1.2, 2.0),
                         sizeMin, max(sizeCap * px, sizeMin));
}
