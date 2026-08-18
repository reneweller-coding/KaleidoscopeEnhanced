#version 330 core
out vec4 fragColor;
// ChromeFlow.frag — fake-environment chrome: the normal indexes a smooth
// striped "sky" so the surface reads as polished metal; a warm key-light
// band and a cool counter-band glide as the surface rolls.
uniform float time;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioCentroid;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioValence;

in vec2  vUV;
in vec3  vNrm;
in float vDist;

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
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 n = normalize(vNrm);

    // TRUE mirror: reflect the view ray and look the reflection up in the
    // photo as a wrap-around environment — this is what makes it CHROME.
    vec3 rd = normalize(vec3((vUV.x - 0.5) * 1.6, -0.35, 1.0));
    vec3 R  = reflect(rd, n);
    vec2 envUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5,
                      clamp(0.55 - R.y * 0.55, 0.02, 0.98));
    vec3 envPhoto = img(envUV);
    float fres = pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 3.0);

    // Sheen bands sweep with the reflection vector (metal polish streaks)
    float envY = R.y * 3.0 + R.x * 1.6;
    float band1 = pow(clamp(sin(envY * 9.0 + time * 0.2) * 0.5 + 0.5, 0.0, 1.0), 3.0);
    float band2 = pow(clamp(sin(envY * 4.0 - time * 0.13 + 2.0) * 0.5 + 0.5, 0.0, 1.0), 5.0);

    vec3 warm = palTint(vec3(0.95, 0.65, 0.30), 0.10, 0.30);
    vec3 cool = palTint(vec3(0.30, 0.50, 0.95), 0.60, 0.30);

    vec3 col = envPhoto * (0.50 + 0.85 * fres)
             + warm * band1 * (0.40 + 0.22 * audioSwell)
             + cool * band2 * (0.30 + 0.18 * audioCentroid);

    // Broad specular from a fixed moon-light.
    float spec = pow(clamp(dot(n, normalize(vec3(0.35, 0.9, -0.25))),
                           0.0, 1.0), 24.0);
    col += vec3(0.9, 0.92, 0.95) * spec * 0.7;

    col *= exp(-vDist * 0.008);
    col /= 1.0 + 0.28 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col * 1.15, 1.0);
}
