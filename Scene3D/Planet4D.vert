#version 330 core
/**
 * @file Planet4D.vert
 * @brief Vertex stage companion to Planet4D.frag -- see that file's header for
 * this scene's description.
 */
// Planet4D.vert — the harmony as a four-dimensional object (after the
// Planet-4D music-space idea): the 12 pitch classes sit on the CLIFFORD
// TORUS in S³ — one circle is the circle of FIFTHS, the other the
// CHROMATIC circle, so 4D distance genuinely encodes both kinds of musical
// neighbourhood at once (something no 3D layout can do).  The whole
// structure performs a 4D double rotation (two independent planes) and is
// stereographically projected back to 3D — the signature "impossible"
// inside-out tumbling of 4D objects.
//
// Live harmony drives it: each node's glow follows its pitch class energy
// in audioChroma[12]; the edges (fifths, major thirds, minor thirds) light
// up when BOTH endpoints sound — chords literally light up their shape —
// and the downbeat sends a pulse travelling along the edges.
//
// Points budget (60k): 12 nodes x 2250 grains (glow clouds), 36 edges x 750
// grains (great-circle SLERP arcs on S³), and 6000 grains of the dust field
// the structure hangs in.
//
// The node clouds used to be 2500 grains packed into a half-unit ball 30
// units out -- a handful of tiny blown-white dots on black, with the rest of
// the picture empty (occupancy 0.35).  The clouds are now real glowing
// planets, several times wider and correspondingly fainter per grain, the
// whole projection is larger, the edge filaments never fall under the ~2.6 px
// an additive sprite needs to stay legible, and the dust field carries the
// corners the projected torus can never reach.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float sceneSeed;

uniform float audioChroma[12];
uniform float audioChromaHue;
uniform float audioDownbeat;
uniform float audioSwell;
uniform float audioKick;
uniform float audioDrop;
uniform float audioRotPhase;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Pitch class i -> point on the Clifford torus in S³:
// alpha runs the circle of fifths (i·7 mod 12), beta the chromatic circle.
vec4 nodePos4(float i)
{
    float a = mod(i * 7.0, 12.0) / 12.0 * 6.2831853;
    float b = i / 12.0 * 6.2831853;
    return vec4(cos(a), sin(a), cos(b), sin(b)) * 0.70710678;
}

// 4D double rotation + slow isoclinic wobble, then stereographic projection.
vec3 project4(vec4 q)
{
    float a1 = time * 0.11 + audioRotPhase * 0.10 + sceneSeed * 6.2831853;
    float a2 = time * 0.073;
    float a3 = 0.35 * sin(time * 0.041);
    q.xy = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * q.xy;
    q.zw = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * q.zw;
    q.xz = mat2(cos(a3), -sin(a3), sin(a3), cos(a3)) * q.xz;
    return q.xyz * (1.55 / (1.35 - q.w)) * 8.4;
}

// SLERP between two (unit) points on S³ — the geodesic edge.
// (nodePos4 is unit-norm: 0.7071·|(cos,sin,cos,sin)| = 0.7071·√2 = 1.)
vec4 slerp4(vec4 a, vec4 b, float t)
{
    float d = clamp(dot(a, b), -1.0, 1.0);
    float om = acos(d);
    float so = max(sin(om), 1e-4);
    return (a * sin((1.0 - t) * om) + b * sin(t * om)) / so;
}

void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    vec3  world = vec3(0.0);
    vec3  vpView = vec3(0.0);
    bool  inView = false;          // layer already given in view space
    vec3  col;
    float bright;
    float sizeMul = 1.0;
    float sizeMin = 1.5, sizeCap = 13.0;

    if (idx < 27000.0)
    {
        // ---- Node glow clouds: 12 x 2250 grains ----
        float node = floor(idx / 2250.0);
        float e = audioChroma[int(min(node, 11.0))] * 4.0;  // L1-norm bins ~0..0.3

        vec4 q = nodePos4(node);
        vec3 c3 = project4(q);

        // Gaussian cloud around the node; radius swells with its energy.
        // Three times the old radius: the grains used to pile into a ball a
        // couple of dozen pixels wide, which clipped to flat white in the
        // core and left the picture black everywhere else.
        float u = r1 * 6.2831853, v = acos(2.0 * r2 - 1.0);
        float rad = (1.55 + 2.30 * e) * pow(r3, 0.6);
        world = c3 + vec3(sin(v) * cos(u), cos(v), sin(v) * sin(u)) * rad;

        // Node hue = position on the colour wheel (pitch class), rotated by
        // the global musical key hue.
        col = hueRot(vec3(1.0, 0.35, 0.25),
                     node / 12.0 * 6.2831853 * 0.5 + audioChromaHue);
        // Per-grain brightness drops with the spread, so a planet gains total
        // light while losing its blown-out core.
        bright = (0.44 + 1.55 * e) * (0.8 + 0.4 * audioSwell) * 0.46;
        sizeMul = 0.9 + 0.9 * e;
        sizeMin = 2.2;
    }
    else if (idx < 54000.0)
    {
        // ---- Edge arcs: 36 edges x 750 grains ----
        float ei   = idx - 27000.0;
        float edge = floor(ei / 750.0);                // 0..35
        float t    = fract(ei / 750.0);
        edge = min(edge, 35.0);

        float a = mod(edge, 12.0);                     // start pitch class
        float typ = floor(edge / 12.0);                // 0 fifths, 1 maj3, 2 min3
        float ivl = (typ < 0.5) ? 7.0 : ((typ < 1.5) ? 4.0 : 3.0);
        float b = mod(a + ivl, 12.0);

        vec4 q = normalize(slerp4(nodePos4(a), nodePos4(b), t));
        world = project4(q);

        // Ribbon jitter so the arc has body.
        world += vec3(r1 - 0.5, r2 - 0.5, r3 - 0.5) * 0.16;

        // Harmonic co-activation: edge lights when BOTH notes sound.
        float ea = audioChroma[int(a)] * 4.0;
        float eb = audioChroma[int(b)] * 4.0;
        float act = min(ea, eb);

        // Downbeat pulse travelling along the edge.
        float pulse = exp(-abs(t - fract(time * 0.4 + edge * 0.13)) * 9.0)
                    * audioDownbeat;

        vec3 tint = (typ < 0.5) ? vec3(0.25, 0.85, 0.95)      // fifths: cyan
                  : (typ < 1.5) ? vec3(1.0, 0.65, 0.20)       // maj 3rd: amber
                                : vec3(0.75, 0.35, 1.0);      // min 3rd: violet
        col = hueRot(tint, audioChromaHue * 0.5);
        // A silent interval used to leave its filament at 0.05 -- invisible.
        // The graph itself is the scene's shape, so it stays faintly drawn.
        bright = 0.30 + 1.9 * act + 1.6 * pulse;
        sizeMul = 0.85;
        sizeMin = 2.2; sizeCap = 8.0;
    }
    else
    {
        // ---- The dust field the structure hangs in: 6000 grains ----
        // Placed in FRUSTUM coordinates (x,y scaled by depth) rather than in a
        // world box, which is what keeps it even across the picture at every
        // distance -- including the corners the projected torus never reaches.
        inView = true;
        float dz = 14.0 + r3 * 82.0;
        float ph = r1 * 6.2831853 + time * 0.06 + audioRotPhase * 0.05;
        // 2.0 would fit the frustum exactly; 2.25 so the field still reaches
        // past all four edges when the preset camera rig rolls the view.
        const float open = 2.25;
        vpView = vec3((r1 - 0.5) * open * dz * kTanY * aspect + 2.0 * cos(ph),
                      (r2 - 0.5) * open * dz * kTanY          + 2.0 * sin(ph * 0.79),
                      dz);
        col = hueRot(vec3(0.34, 0.48, 0.92), audioChromaHue * 0.5);
        bright = (0.085 + 0.10 * r3) * (0.8 + 0.4 * audioSwell)
               * clamp(1.0 - dz / 150.0, 0.0, 1.0);
        // A speck must stay legible at any distance -- below ~2.6 px an
        // additive sprite averages away and the far field reads black again.
        sizeMul = 0.78; sizeMin = 2.6; sizeCap = 9.0;
    }

    vec3 vp = inView ? vpView : world + vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * sizeMul * (0.5 + 0.5 * r4) * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));

    col *= bright * (1.0 + 0.25 * audioKick + 0.9 * audioDrop);
    // Cap the TINTED vec3, not the scalar feeding it: a hue-rotated node
    // colour runs past 1.0 per channel on its own.
    vCol = vec4(min(col * 2.8, vec3(3.0)), 1.0);
}
