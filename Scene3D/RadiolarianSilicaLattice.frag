#version 330 core
out vec4 fragColor;
// RadiolarianSilicaLattice.frag
// -----------------------------------------------------------------------
// RADIOLARIAN SILICA LATTICE: concentric glass micro-skeleton shells
// rotating against each other, seen from a safe distance (no camera
// collisions); silica cards tinted by the photo palette, star sparkles
// on the kick.
//   audioKick -> shell burst    audioSwell -> lattice breathing
//   latticeP  -> shell spacing
// -----------------------------------------------------------------------

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in vec3 vWorldPos;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Icosahedral skeletal mesh pattern inside the card
    vec2 p = vUV * 6.0;
    float hexGrid = min(min(abs(sin(p.x)), abs(sin(p.x * 0.5 + p.y * 0.866))), abs(sin(p.x * 0.5 - p.y * 0.866)));
    float latticeStrut = exp(-hexGrid * 14.0);

    // Specular glass highlight
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.4, 0.9, -0.5));
    vec3 viewDir = normalize(-vWorldPos);
    float spec = pow(max(dot(viewDir, reflect(-lightDir, n)), 0.0), 32.0);

    vec3 col = mix(vCol.rgb * 0.4, photo * 1.4, 0.7);
    col += latticeStrut * vCol.rgb * 2.0;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}
