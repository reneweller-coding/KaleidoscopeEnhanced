//@doc
 * @brief SPHERE SKY SWARM: particles living on a sphere round the eye, like swarmalators on a sphere: they gather into
 * bands that circle the sky and into vortices that spin in place, drifting between the two as their coupling
 * changes.  Each particle has a place on the sphere and an internal phase; a band particle circles its latitude at
 * a speed set by its phase, a vortex particle circles one of a few centres; a coupling value blends each particle
 * between its band and its vortex place.  The eye at the centre looks out; the particles are round points, brighter
 * near the view's middle.  Their light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the coupling glides with the chord changes: bands melt into vortices and back
 *   audioAdvance     -> the swarm's motion (integrated)
 *   audioSwell       -> the points' glow
 *
 * Knobs: pointP (how many particles), vortexP (how many vortices), hueP.
//@params pointP vortexP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float N = floor(260.0 + 140.0 * clamp(pointP, 0.0, 1.0));
    float vort = floor(3.0 + 3.0 * clamp(vortexP, 0.0, 1.0));
    float couple = 0.5 + 0.5 * sin(0.6 * h);
    float run = 0.08 * sceneTime + 0.3 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float look = 0.02 * sceneTime + 0.06 * audioAdvance;
    vec3 fw = normalize(vec3(sin(look), 0.25 * sin(0.6 * look), cos(look)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int i = 0; i < 400; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        // the band place: circling its latitude, faster for higher internal phase
        float lat = 1.6 * (h1 - 0.5);
        float lon = 6.2831853 * h2 + run * (0.6 + 0.8 * h1) * (h1 < 0.5 ? 1.0 : -1.0);
        vec3 band = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
        // the vortex place: circling one of the centres, spread over the sky on a golden spiral
        float k = floor(h2 * vort);
        float cy = 0.8 * (1.0 - 2.0 * (k + 0.5) / vort);
        vec3 cv = vec3(sqrt(1.0 - cy * cy) * sin(2.39996 * k + 0.5), cy, sqrt(1.0 - cy * cy) * cos(2.39996 * k + 0.5));
        vec3 a1 = normalize(cross(cv, vec3(0.0, 1.0, 0.0))), a2 = cross(cv, a1);
        float rr = 0.15 + 0.4 * h1;
        float va = run * 2.0 / (0.3 + rr) + 6.2831853 * h1;
        vec3 vortex = normalize(cv + rr * (cos(va) * a1 + sin(va) * a2));
        vec3 x = normalize(mix(band, vortex, couple));
        float z = dot(x, fw);
        if (z < -0.6) continue;
        // stereographic view: the whole front of the sky fits on the screen
        vec2 sp = vec2(dot(x, rt), dot(x, up)) / (1.0 + z) * 1.1;
        float size = 0.011 / (1.0 + z);
        float d = length(p - sp);
        float g = smoothstep(size, size * 0.6, d) + 0.25 * exp(-d / (size * 2.5));
        col += famLight(fh, fract(h1 + 0.3 * couple), 0.4) * g * glow * (0.5 + 0.5 * z);
    }
    finish(famExpose(col, 4.61, 0.70, 0.03, fh));
}
