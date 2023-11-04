import * as THREE from "three";
import React, { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import Perlin from "perlin.js";
import seedrandom from "seedrandom";
import { LRUCache } from "lru-cache";
import { useThree, extend, useFrame } from "@react-three/fiber";
import { Depth, LayerMaterial } from "lamina";
import WindLayer from "./WindLayer";
import { MeshSurfaceSampler } from 'three-stdlib'
import gsap from "gsap";
import { throttle } from "lodash";
import { useFBO, OrthographicCamera, Sampler } from "@react-three/drei";

const rng = seedrandom(1);
Perlin.seed(rng());
extend({ WindLayer });

// Precompute Perlin Noise values and store them
const perlinCache = new LRUCache({
  max: 1000 // limit the number of items in the cache
});

function getPerlinValue(position, scale) {
  const p = position.clone().multiplyScalar(scale);
  const key = p.toArray().toString();

  let value = perlinCache.get(key);

  if (!value) {
    value = Perlin.simplex3(...p.toArray());
    perlinCache.set(key, value);
  }

  return value;
}

const coneGeometry = new THREE.ConeGeometry(0.035, 1, 2, 10, false, 0, Math.PI);

export const Grass = ({
  count = 16_000,
  intersectionPoint,
  ...props
}) => {
  const vegetationMeshRef = useRef(null);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const [pointer] = useState(() => new THREE.Vector3(99, 99, 99));
  const [uv] = useState(() => new THREE.Vector3(99, 99, 99));
  const [windVec] = useState(() => new THREE.Vector2());
  const renderTarget = useFBO();
  const backRenderTarget = useFBO();
  const progressObject = useMemo(() => ({
    progress: 0
  }), []);
  const [timeout, setTheTimeout] = useState(null);
  const [savedTarget, setSavedTarget] = useState(new THREE.Vector3());
  const windLayer = useRef(null);
  const orthCamRef = useRef(null);
  const planetRef = useRef(null);
  const samplerRef = useRef(null);

  const {scene, camera, gl, viewport: {
    width,
    height
  }} = useThree();

  const {plane, orth, material} = useMemo(() => {
    // const geometry = new THREE.PlaneGeometry( 1, 1 );
    // const material = new THREE.MeshBasicMaterial( {color: 0xffff00, side: THREE.DoubleSide} );
    // const plane = new THREE.Mesh( geometry, material );
    const material = new THREE.RawShaderMaterial({
      fragmentShader: `precision highp float;
      uniform vec2 uMousePos;
      uniform float uMousePower;
      uniform float uRatio;
      uniform sampler2D uTexture;
      varying vec2 vUv;

      void main() {
        vec2 uv = vec2(vUv.x, vUv.y);
        float d = distance(vUv, uMousePos);
        // is in
        float val = clamp(d*1./uMousePower, 0., 1.);
        float lerp = step(0.1, val);
        // vec4 curColor = mix(gl_FragColor, color, lerp);
        // gl_FragColor = vec4(1.0,.0,.0,1.0);
        vec4 tex = texture2D(uTexture, uv);
        vec4 newColor = vec4(clamp(mix(tex.r, 0., .05), 0., 1.), 0., 0., 1.);
        gl_FragColor = mix(vec4(1.0,0.0,0.0,1.0), newColor, lerp);
      }
      `,
      vertexShader: `precision highp float;
      #define GLSLIFY 1
      varying vec2 vUv;
      attribute vec2 uv;
      attribute vec3 position;

      void main() {
        vUv = uv;
        gl_Position = vec4(position*2., 1.);
      }
      `,
      uniforms: {
        uMousePower: {
          value: .5,
          type: "f"
        },
        uRatio: {
          value: width/height,
          type: "f"
        },
        uMousePos: {
          value: {
            x: 0,
            y: 0,
            z: 0
          },
          type: 'v3'
        },
        uTexture: {
          value: new THREE.Texture
        }
      },
      depthTest: false,
      depthWrite: false,
      alphaTest: false
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(camera.width, camera.height), material);

    const newScene = new THREE.Scene;
    const orth = new THREE.OrthographicCamera();
    orth.width = plane.width*512;
    orth.height = plane.height*512;

    return {
      plane,
      orth,
      material
    }
  }, []);

  useLayoutEffect(() => {
    plane.position.copy(orthCamRef.current.position)
    scene.add(plane);
    
  }, []);

  const transformFunc = useCallback(
    ({ position, normal, dummy: object, instanceId }) => {
      const p = position.clone().multiplyScalar(5);
      const n = Perlin.simplex3(...p.toArray());
      object.scale.setScalar(THREE.MathUtils.mapLinear(n, -1, 1, 0.3, 1) * 0.1);
      object.position.x = position.x;
      object.position.y = position.y + 0.01;
      object.position.z = position.z;
      object.quaternion.setFromUnitVectors(up, normal);
      object.rotation.y += rng() - 0.5 * (Math.PI * 0.5);
      object.rotation.z += rng() - 0.5 * (Math.PI * 0.5);
      object.rotation.x += rng() - 0.5 * (Math.PI * 0.5);
      object.updateMatrix();
      return object;
    },
    []
  );

  const animateDamp = useCallback(throttle(() => {
    const tl = gsap.timeline();
    tl.to(progressObject, { progress: 1, duration: 1, ease: 'power2.out' });
    tl.to(progressObject, { progress: 0, duration: 1, ease: 'power2.in' });
  }, 1000), []);

  useFrame(({ clock, camera }) => {
    plane.visible = true;
    plane.material.uniforms.uMousePos.value = uv;
    windLayer.current.time = clock.getElapsedTime();
    windLayer.current.mousePos = pointer;
    windLayer.current.windVec = windVec;
    windLayer.current.progress = progressObject.progress;

    gl.setRenderTarget(renderTarget);
    vegetationMeshRef.current.visible = false;
    planetRef.current.visible = false;
    gl.render(scene, orthCamRef.current);
    plane.material.uniforms.uTexture.value = renderTarget.texture;
    // planetRef.current.material.uniforms.uMousePos.value = uv;
    gl.setRenderTarget(backRenderTarget);
    gl.render(scene, orthCamRef.current);
    backRenderTarget.texture.flipY = false;
    plane.material.uniforms.uTexture.value = backRenderTarget.texture;
    windLayer.current.textureDrw = backRenderTarget.texture;
    // planetRef.current.material.uniforms.uTexture.value = backRenderTarget.texture;
    // planetRef.current.material.side = THREE.FrontSide;
    plane.material.side = THREE.FrontSide;
    gl.setRenderTarget(null);
    vegetationMeshRef.current.visible = true;
    planetRef.current.visible = true;
    // plane.visible = false;
  });

  return (
    <>
      <OrthographicCamera ref={orthCamRef} />
      <mesh
        ref={planetRef}
        onPointerMove={(e) => {
          e.stopPropagation();
          pointer.copy(e.point);
          uv.copy(e.uv);
          animateDamp();
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        {/* <planeGeometry args={[3, 3]} /> */}
        <meshStandardMaterial depthWrite={false} />
        {/* <shaderMaterial fragmentShader={`
      uniform float uTime;
      uniform vec2 uMousePos;
      uniform sampler2D uTexture;
      varying vec2 vUv;

      void main() {
        vec2 uv = -1.0 + 2.0 *vUv;
        float d = distance(vUv, uMousePos);
        // is in
        // float val = clamp(d, 0., 1.);
        // float lerp = step(0.1, val);
        // vec4 curColor = mix(gl_FragColor, color, lerp);
        // gl_FragColor = vec4(1.0,.0,.0,1.0);
        vec4 tex = texture(uTexture, uv);
        vec4 newColor = vec4(clamp(tex.r, 0., 1.), 0., 0., 1.);
        // gl_FragColor = vec4(1.0,0.0,0.0,1.0);
        // gl_FragColor = tex;
        gl_FragColor = mix(vec4(1.0,0.0,0.0,1.0), newColor, d*20.);
      }
      `}
      
      vertexShader={`
        #define GLSLIFY 1
        varying vec2 vUv;
  
        void main() {
          vUv = uv; 
    
          vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewPosition; 
        }`}

        uniforms={{
          uTime: {
            value: 0,
            type: "f"
          },
          uMousePos: {
            value: {
              x: 0,
              y: 0,
              z: 0
            },
            type: 'v3'
          },
          uTexture: {
            value: new THREE.Texture
          }
        }}
      /> */}
      </mesh>
      <Sampler
        transform={transformFunc}
        count={count}
        mesh={planetRef}
        instances={vegetationMeshRef}
      >
        <instancedMesh
          ref={vegetationMeshRef}
          args={[null, null, count]}
          {...props}
        >
          <primitive object={coneGeometry} />
          <LayerMaterial side={THREE.DoubleSide}>
            <Depth
              colorA="#221600"
              colorB="#ade266"
              near={0.14}
              far={1.52}
              mapping={"world"}
            />
            <windLayer
              args={[{ mode: "multiply" }]}
              noiseScale={5}
              noiseStrength={5}
              length={6}
              sway={0.6}
              ref={windLayer}
            />
          </LayerMaterial>
        </instancedMesh>
      </Sampler>
    </>
  );
};
