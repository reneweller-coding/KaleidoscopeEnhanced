//@doc
 * @brief COLOUR SOLID SLICE CYCLE: the RGB cube in slices: the picture shows sections through the colour cube that glide through the surface as triangles and hexagons; the photo lies in the sections.  A plane that turns through the cube cuts a triangle, a hexagon or a rectangle; every pixel takes the colour of
 * its point on the plane, and the photo's brightness moves the plane to and fro, so the sections follow the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the plane turns and glides through the cube (integrated)
 *   audioSwell   -> how far the photo moves the plane
 *
 * Knobs: sizeP (the size of the section), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * audioAdvance + 0.04 * sceneTime;
    vec3 n = normalize(vec3(sin(t * 1.3) * 0.8 + 0.6, cos(t * 0.9) * 0.7 + 0.5, sin(t * 0.7 + 1.0) * 0.8 + 0.6));
    vec3 u = normalize(cross(n, vec3(0.0, 1.0, 0.3 * sin(t))));
    vec3 v = cross(n, u);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float off = (luma(c) - 0.5) * (0.15 + 0.45 * clamp(audioSwell, 0.0, 1.0)) + 0.25 * sin(0.7 * t * 3.0);
    float sz = 0.7 + 0.7 * clamp(sizeP, 0.0, 1.0);
    vec3 q = vec3(0.5) + n * off + u * p.x * sz + v * p.y * sz;
    float inside = step(0.0, min(q.x, min(q.y, q.z))) * step(max(q.x, max(q.y, q.z)), 1.0);
    vec3 col = clamp(q, 0.0, 1.0) * inside;
    float edge = smoothstep(0.0, 0.03, min(min(q.x, 1.0 - q.x), min(min(q.y, 1.0 - q.y), min(q.z, 1.0 - q.z))));
    col *= 0.7 + 0.3 * edge;
    vec3 ph = imgLod(p * 0.85 + 0.5, 1.5);
    col = mix(col, col * (0.5 + ph), 0.4);
    finish(col * 1.1 + (1.0 - inside) * ph * 0.08);
}
