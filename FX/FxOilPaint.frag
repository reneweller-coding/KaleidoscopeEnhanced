#version 330 core
out vec4 fragColor;
/**
 * @file FxOilPaint.frag
 * @brief FX OIL PAINT: Kuwahara-style edge-preserving smoothing -- each pixel
 * picks the least-variance quadrant of its neighbourhood, giving a
 * painterly, brushstroke-flattened look.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
 
 const int radius = 7;

 void main (void) 
 {
	 vec2 src_size = vec2 (1.0 / resolution.x, 1.0 / resolution.y);
     vec2 uv = gl_FragCoord.xy/resolution.xy;
     float n = float((radius + 1) * (radius + 1));
     int i; 
	 int j;
     vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
     vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
     vec3 c;
 

     for (int j = -radius; j <= 0; ++j)  {
         for (int i = -radius; i <= 0; ++i)  {
            // c = texture(iChannel0, uv + vec2(i,j) * src_size).rgb;
             c = interpolation * texture(tex0, uv + vec2(i,j) * src_size).rgb + (1.0-interpolation)*texture(tex1, uv + vec2(i,j) * src_size).rgb;
             m0 += c;
             s0 += c * c;
         }
     }

     for (int j = -radius; j <= 0; ++j)  {
         for (int i = 0; i <= radius; ++i)  {
             //c = texture(iChannel0, uv + vec2(i,j) * src_size).rgb;
             c = interpolation * texture(tex0, uv + vec2(i,j) * src_size).rgb + (1.0-interpolation)*texture(tex1, uv + vec2(i,j) * src_size).rgb;
             m1 += c;
             s1 += c * c;
         }
     }

     for (int j = 0; j <= radius; ++j)  {
         for (int i = 0; i <= radius; ++i)  {
             //c = texture(iChannel0, uv + vec2(i,j) * src_size).rgb;
             c = interpolation * texture(tex0, uv + vec2(i,j) * src_size).rgb + (1.0-interpolation)*texture(tex1, uv + vec2(i,j) * src_size).rgb;
             m2 += c;
             s2 += c * c;
         }
     }

     for (int j = 0; j <= radius; ++j)  {
         for (int i = -radius; i <= 0; ++i)  {
             //c = texture(iChannel0, uv + vec2(i,j) * src_size).rgb;
             c = interpolation * texture(tex0, uv + vec2(i,j) * src_size).rgb + (1.0-interpolation)*texture(tex1, uv + vec2(i,j) * src_size).rgb;
             m3 += c;
             s3 += c * c;
         }
     }


     float min_sigma2 = 1e+2;
     m0 /= n;
     s0 = abs(s0 / n - m0 * m0);

     float sigma2 = s0.r + s0.g + s0.b;
     if (sigma2 < min_sigma2) {
         min_sigma2 = sigma2;
         fragColor = vec4(m0, 1.0);
     }

     m1 /= n;
     s1 = abs(s1 / n - m1 * m1);

     sigma2 = s1.r + s1.g + s1.b;
     if (sigma2 < min_sigma2) {
         min_sigma2 = sigma2;
         fragColor = vec4(m1, 1.0);
     }

     m2 /= n;
     s2 = abs(s2 / n - m2 * m2);

     sigma2 = s2.r + s2.g + s2.b;
     if (sigma2 < min_sigma2) {
         min_sigma2 = sigma2;
         fragColor = vec4(m2, 1.0);
     }

     m3 /= n;
     s3 = abs(s3 / n - m3 * m3);

     sigma2 = s3.r + s3.g + s3.b;
     if (sigma2 < min_sigma2) {
         min_sigma2 = sigma2;
         fragColor = vec4(m3, 1.0);
     }
 }