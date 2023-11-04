import { Abstract } from "lamina/vanilla";
import { Vector3, Color, Vector2, Texture } from "three";

export default class WindLayer extends Abstract {
  static u_time = 0;
  static u_sway = 0.5;
  static u_length = 1;

  static u_noiseScale = 10.0;
  static u_noiseStrength = 10.0;
  static u_mousePower = -2;
  static u_progress = 0;

  static u_mousePos = new Vector3(99, 99, 99);
  static u_windVec = new Vector2();
  static u_textureDrw = new Texture();

  static u_isCurl = false;

  static vertexShader = `   
    uniform float u_time;
    uniform float u_sway;
    uniform float u_length;
    uniform bool u_isCurl;
    uniform vec3 u_mousePos;
    uniform vec2 u_windVec;
    uniform float u_mousePower;
    uniform float u_progress;
    uniform sampler2D u_textureDrw;

    varying vec3 v_pos;
    
    float atan2(in float y, in float x)
    {
        bool s = (abs(x) > abs(y));
        return mix(PI/2.0 - atan(x,y), atan(y,x), float(s));
    }

    // https://en.wikipedia.org/wiki/File:Equirectangular_projection_SW.jpg
    vec2 sphere2mapUV_Equirectangular(vec3 p)
    {
        return vec2(
            atan(-p.z, p.x) / (2. * PI) + .5,
            p.y * .5 + .5
        );
    }

    // https://en.wikipedia.org/wiki/File:Lambert_cylindrical_equal-area_projection_SW.jpg
    vec2 sphere2mapUV_EqualArea(vec3 p)
    {
        return vec2(
            (atan(-p.z, p.x) / (PI) + 1.) / 2.,
            asin(p.y) / PI + .5
        );
    }

    vec3 main() {
      vec3 pos = position.xyz;
      vec3 base = vec3(pos.x, pos.y, 0.0);
      vec4 baseGP = instanceMatrix * vec4(base, 1.0);
      v_pos = baseGP.xyz;
      float d = distance(baseGP.xyz, u_mousePos);
      float cover = .25;

      vec2 noise = u_isCurl ? 
        (lamina_noise_curl(baseGP.xyz * 0.1 + u_time * 0.5 * u_sway)).xy 
      : vec2(
          lamina_noise_perlin(baseGP.xyz * 0.1 + u_time * 0.5 * u_sway),
          lamina_noise_simplex(baseGP.xyz * 0.1 + u_time * 0.5 * u_sway)
        );
    
      noise = smoothstep(-1.0, 1.0, noise);

      // Change swing logic here
      // float swingX = sin(-u_windVec.x) * pow(pos.y, 2.0);
      // float swingY = cos(-u_windVec.y) * pow(pos.y, 2.0);

      float swingX = sin(u_time + (noise.x) * PI) * pow(pos.y*.7, 2.0);
      float swingY = cos(u_time + (noise.y) * PI) * pow(pos.y*.7, 2.0);
    
      // float val = PI/2.+((d * 5.)*(PI/2.));
      pos.x += swingX * u_mousePower; // * sin(val);
      pos.z += swingY * u_mousePower; // * sin(val);
      float progress = mix(0., 1.-(d*3.), u_progress);

      // vec3 sphere_surface_point = baseGP.xyz;

      // vec2 newUv = sphere2mapUV_Equirectangular(v_pos.xyz);
      vec2 newUv = sphere2mapUV_EqualArea(baseGP.xyz);

      return (mix(position.xyz, pos, smoothstep(0., 1., texture2D(u_textureDrw, vec2(newUv)).r*u_progress)) * u_length);
    }
  `;

  constructor(props) {
    super(WindLayer, {
      name: "GrassLayer",
      ...props
    });
  }
}
