#version 330 core
/**
 * @file AcousticLevitationMatrix.vert
 * @brief Vertex stage companion to AcousticLevitationMatrix.frag -- see that file's header for
 * this scene's description.
 */
// AcousticLevitationMatrix.vert — 4,900 monolithic levitating voxels
// trapped in an ultrasonic standing wave field creating a volumetric 3D photo display.
//   attrA.xyz = local cube corner (-0.5..0.5), attrA.w = cube index (0..4899)
//   attrB     = four per-cube seeds in [0,1)
//
// The trap is a genuine VOLUME now: 33 x 10 x 14 voxels on eleven nodal planes
// filling the frustum from close range out to depth 34, at a near-constant
// on-screen voxel size, backed by a dim 20 x 14 transducer-panel wall that
// carries the photo across the whole frame.  The old build scattered 4,900
// 4-pixel cubes over one thin slab that sat in the lower half of the picture
// (luma 0.011, occ 0.21), and its floor()ed node height made every voxel snap
// between layers.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioCentroid;
uniform float audioSwell;
uniform float audioHigh;

uniform float nodeP;
uniform float liftP;
uniform float speedP;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4 vCol;      // rgb = voxel colour, a = brightness (depth fade / panel dim)
out vec2 vUV;
out vec3 vNormal;

// Shared 55-degree frustum (see Scene3DShader::render).
const float TAN_HALF_FOV = 0.52056705;
const float ASPECT_GUESS = 1.7777778;

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
    float ci = attrA.w;
    vec3 corner = attrA.xyz;

    float nod = (nodeP  > 0.0) ? nodeP  : 1.0;
    float lft = (liftP  > 0.0) ? liftP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    float t = time * 0.4 * spd + audioAdvance * 0.15;

    vec3  relP;
    vec3  col;
    float dim;
    float standingWave = 0.0;

    if (ci < 4620.0)
    {
        // ================= levitating voxel volume =========================
        float ix = mod(ci, 33.0);
        float iy = mod(floor(ci / 33.0), 10.0);
        float iz = floor(ci / 330.0);                 // 0..13

        vec3 gr = vec3(ix / 32.0, iy / 9.0, iz / 13.0) - 0.5;   // -0.5..0.5

        float x  = gr.x * 34.0 + (attrB.x - 0.5) * 0.85;
        float zz = gr.z * 30.0 + (attrB.y - 0.5) * 0.85;

        // Eleven acoustic nodal planes: each voxel is trapped in ITS OWN plane
        // (a per-voxel constant), so the trap is a volume and nothing snaps
        // between layers the way the old floor()ed height field did.
        // Plane spacing only PARTLY follows liftP: at the preset minimum of 0.5
        // a straight multiply squashed the eleven planes back into one thin
        // slab, which is the shape the scene was flagged for in the first place.
        float y = (iy - 4.5) * (1.30 * (0.65 + 0.35 * lft));

        float k = 1.2 * nod;
        standingWave = sin(x * k) * cos(zz * k) * sin(t * 3.0);
        y += standingWave * 0.55 * lft
           + sin(x * 0.8 + zz * 0.8 + t * 4.0) * 0.28 * (1.0 + audioBass);

        // Kick particle ejection jump — widened so the whole field reacts.
        y += audioKick * 1.6 * exp(-length(vec2(x, zz)) * 0.12);

        float dep = max(zz + 19.0, 1.2);

        // Voxel rotation on acoustic torque
        float spin = t * 2.0 + attrB.z * 6.2831853;
        mat3 rotY = mat3(cos(spin), 0.0, sin(spin), 0.0, 1.0, 0.0, -sin(spin), 0.0, cos(spin));

        // Near-constant on-screen size: a fixed 0.12 world cube was under four
        // pixels across at this depth, which is why the frame read as black.
        float vs = clamp(0.024 * dep, 0.16, 0.78) * (1.0 + 0.30 * audioHigh);
        vec3 localPos = rotY * (corner * vec3(vs));

        relP = vec3(x, y - 0.6, dep) + localPos;

        vNormal = rotY * normalize(corner);
        vUV = clamp(gr.xy + 0.5, 0.0, 1.0);

        col = imgPalette(0.30 * (gr.y + 0.5) + 0.12 * (gr.z + 0.5) + 0.10 * audioCentroid) * 1.25;
        col = mix(col, vec3(1.0, 0.95, 0.45), abs(standingWave) * 0.7);

        // Aerial perspective: the far half of the volume fades, which is both
        // the depth cue and the guard against the dense vanishing point
        // over-exposing.
        dim = mix(1.0, 0.42, clamp((dep - 5.0) / 28.0, 0.0, 1.0));
    }
    else
    {
        // ================= transducer panel wall ===========================
        // A dim 20 x 14 array carrying the slideshow photo right across the
        // frame, so the space between the voxels reads as the emitter array of
        // the levitator instead of as dead black.
        float bi  = ci - 4620.0;                      // 0..279
        float bxi = mod(bi, 20.0);
        float byi = floor(bi / 20.0);                 // 0..13

        float cxr = (bxi + 0.5) / 20.0 * 2.0 - 1.0;
        float cyr = (byi + 0.5) / 14.0 * 2.0 - 1.0;

        // Depth is a per-panel CONSTANT: panels overlap by 6% so the array has
        // no gaps, and if their depths animated past each other that overlap
        // would flip which panel wins the depth test -- a popping seam.
        float D = 42.0 + 3.0 * sin(bxi * 0.7 + byi * 1.1);
        // 1.0 would fit the frustum exactly; 1.12 keeps the array past all four
        // edges while the preset camera rig rolls, yaws and pitches.
        const float OPEN = 1.12;
        vec3 pc = vec3(cxr * TAN_HALF_FOV * ASPECT_GUESS * D * OPEN,
                       cyr * TAN_HALF_FOV * D * OPEN,
                       D);
        vec3 halfSz = vec3(TAN_HALF_FOV * ASPECT_GUESS * D * OPEN / 20.0 * 1.06,
                           TAN_HALF_FOV * D * OPEN / 14.0 * 1.06,
                           0.25);
        relP = pc + corner * (halfSz * 2.0);

        vNormal = normalize(vec3(0.0, 0.25, -0.97));
        vUV = clamp(vec2((bxi + corner.x + 0.5) / 20.0,
                         (byi + corner.y + 0.5) / 14.0), 0.0, 1.0);

        float panelWave = 0.5 + 0.5 * sin(cxr * 4.0 + cyr * 3.0 + t * 2.0);
        col = imgPalette(0.20 + 0.30 * (cyr * 0.5 + 0.5)) * 1.1;
        dim = 0.26 * (0.70 + 0.55 * panelWave * (0.5 + 0.9 * audioBass)
                           + 0.25 * audioSwell);
    }

    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col, dim);
}
