//@doc
 * @brief MIRROR BALL INTERIOR: inside a disco ball, looking out: thousands of small square facets line the sphere
 * round the eye, each tilted a little, each reflecting the world outside -- a sparkling sky of squares in which a
 * single light outside flashes across the facets that catch it.  Optics: a facet's normal is the sphere's normal
 * turned by the facet's own small tilt; the view ray reflected there looks into the world outside (the photo as a
 * panorama), and where it points at the light the facet blazes.  The facets sit on a latitude-longitude grid, their
 * count shrinking toward the poles, with dark grout between them.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the ball turns (integrated)
 *   audioKick    -> a scattering of facets flashes (light)
 *   audioSwell   -> the light outside grows larger
 *
 * Knobs: facetP (the facets' size), tiltP (how much the facets are tilted), hueP.  Distinct from MirrorBallRoom,
 * which shows the room from outside.
//@params facetP tiltP
//@audio audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float rows = floor(40.0 - 20.0 * clamp(facetP, 0.0, 1.0));
    float tiltK = 0.04 + 0.1 * clamp(tiltP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float kick = clamp(audioKick, 0.0, 1.0);
    float lightSize = 0.02 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    // the eye at the ball's centre, looking out along a slowly wandering direction
    vec3 fw = normalize(vec3(0.3 * sin(0.03 * sceneTime), 0.35 + 0.2 * sin(0.02 * sceneTime), 1.0));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 d = normalize(fw * 0.9 + rt * p.x + up * p.y);
    d.xz = rot2(turn) * d.xz;
    // the facet: latitude rows, each row as many squares as fit round it
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float r = floor((lat / 3.14159265 + 0.5) * rows);
    float latC = ((r + 0.5) / rows - 0.5) * 3.14159265;
    float cols = max(floor(2.0 * rows * cos(latC)), 4.0);
    float lon = atan(d.z, d.x) / 6.2831853 + 0.5;
    float c = floor(lon * cols);
    vec2 inF = vec2(fract(lon * cols), fract((lat / 3.14159265 + 0.5) * rows)) - 0.5;
    float hc = fract(sin(r * 12.9898 + c * 78.233) * 43758.5453), hc2 = fract(hc * 7.31);
    // the facet's normal: the sphere's (inward) turned by its own tilt
    float lonC = (c + 0.5) / cols * 6.2831853 - 3.14159265;
    vec3 nS = -vec3(cos(latC) * cos(lonC), sin(latC), cos(latC) * sin(lonC));
    vec3 n = normalize(nS + tiltK * vec3(hc - 0.5, hc2 - 0.5, fract(hc * 3.7) - 0.5));
    vec3 refl = reflect(d, n);
    // the world outside: the photo as a panorama; the light: a small bright disc
    vec2 pan = vec2(abs(atan(refl.z, refl.x)) / 3.14159265, refl.y * 0.5 + 0.5);   // mirrored: no seam
    vec3 photo = imgLod(pan, 2.0);
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.15 + 0.7 * luma(photo));
    vec3 L = normalize(vec3(cos(0.2 * sceneTime), 0.5, sin(0.2 * sceneTime)));
    float blaze = exp(-(1.0 - dot(refl, L)) / lightSize);
    col += famLight(fh, 0.6, 0.8) * blaze * 1.6;
    col += famLight(fh, hc, 0.6) * kick * step(0.93, hc2) * 1.2;
    // the grout between the facets
    float grout = smoothstep(0.5, 0.42, max(abs(inF.x), abs(inF.y)));
    col *= grout;
    finish(col);
}
