import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { Grass } from "./Grass";

export default function App() {
  const planetRef = useRef();

  return (
    <Canvas camera={{ position: [0, 0, 1.8] }} >
      <ambientLight />
      <OrbitControls />
      <Perf />
      <Grass count={100000} />
    </Canvas>
  );
}
