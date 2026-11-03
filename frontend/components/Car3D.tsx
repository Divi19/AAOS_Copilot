"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { TrackballControls, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TrackballControls as TrackballControlsImpl } from "three-stdlib";
import type { VehicleState } from "../lib/vehicleState";

const MODEL_URL = "/models/car-concept.glb";
const BLUE = "#98cbff";
const MODEL_SIZE = 4.2;        // longest side of the car in scene units
const FILL_OPACITY = 0.045;    // translucent body shell
const EDGE_OPACITY = 0.32;     // body outlines
const DETAIL_EDGE_OPACITY = 0.06; // interior detail, kept faint so the silhouette reads first
const FRAME_FILL = 0.72;       // share of the panel's smaller side the car should fill

// Interior detail that would clutter the hologram (pedals, steering, panels, brakes...)
const DETAIL = /^Interior(?!Seats|Door)|^Engine|^Axles|BrakePad|BrakeDisc|Gasket|Wipers/;

export interface CarRig {
  root: THREE.Group;
  centre: THREE.Vector3;
  radius: number;
  front: THREE.Vector3;  // unit vector towards the headlights
  left: THREE.Vector3;   // unit vector towards the driver's (left) door
  meshes: THREE.Mesh[];
}

function hologramMaterials(mesh: THREE.Mesh) {
  const detail = DETAIL.test(mesh.name) || DETAIL.test(mesh.parent?.name ?? "");
  mesh.material = new THREE.MeshBasicMaterial({
    color: BLUE, transparent: true, opacity: FILL_OPACITY, depthWrite: false, side: THREE.DoubleSide,
  });
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 40),
    new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: detail ? DETAIL_EDGE_OPACITY : EDGE_OPACITY, depthWrite: false }),
  );
  edges.name = `${mesh.name}__edges`;
  edges.userData.baseOpacity = detail ? DETAIL_EDGE_OPACITY : EDGE_OPACITY;
  mesh.add(edges);
}

function centreOf(obj: THREE.Object3D | undefined) {
  return obj ? new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()) : null;
}

/** Normalise the model (size, floor at y=0, centred) and work out its front and left directions. */
function buildRig(scene: THREE.Group): CarRig {
  const model = scene.clone(true);
  const meshes: THREE.Mesh[] = [];
  model.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  meshes.forEach(hologramMaterials);

  const root = new THREE.Group();
  root.add(model);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.y, size.z));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const mid = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(mid.x, box.min.y, mid.z));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);

  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const horizontal = (v: THREE.Vector3) => v.setY(0).normalize();
  const head = centreOf(model.getObjectByName("BodyHeadlights"));
  const door = centreOf(model.getObjectByName("BodyDoorLColor1"));
  const front = head ? horizontal(head.sub(centre)) : new THREE.Vector3(0, 0, 1);
  const left = door ? horizontal(door.sub(centre)) : new THREE.Vector3(1, 0, 0);
  return { root, centre, radius, front, left, meshes };
}

function disposeRig(rig: CarRig) {
  rig.root.traverse(o => {
    const m = o as THREE.Mesh | THREE.LineSegments;
    if (m.geometry && (m as THREE.LineSegments).isLineSegments) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => mat.dispose());
  });
}

/** Frames the car to fill the panel, and re-fits on resize; double-click resets the view. */
function CameraRig({ rig }: { rig: CarRig }) {
  const { camera, size, gl } = useThree();
  const controls = useRef<TrackballControlsImpl>(null);

  const viewDir = useMemo(
    () => rig.front.clone().multiplyScalar(0.85).add(rig.left.clone().multiplyScalar(0.95)).add(new THREE.Vector3(0, 0.55, 0)).normalize(),
    [rig],
  );

  const distance = () => {
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    return rig.radius / Math.sin(Math.min(vFov, hFov) / 2) / FRAME_FILL;
  };

  const reset = () => {
    camera.position.copy(rig.centre).addScaledVector(viewDir, distance());
    camera.up.set(0, 1, 0);
    camera.lookAt(rig.centre);
    if (controls.current) {
      controls.current.target.copy(rig.centre);
      controls.current.update();
    }
  };

  // Initial framing, and keep the same zoom level relative to the panel when it resizes
  useEffect(() => {
    if (!controls.current) return reset();
    const dir = camera.position.clone().sub(controls.current.target).normalize();
    camera.position.copy(controls.current.target).addScaledVector(dir.lengthSq() ? dir : viewDir, distance());
    controls.current.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  useEffect(() => {
    reset();
    const el = gl.domElement;
    el.addEventListener("dblclick", reset);
    return () => el.removeEventListener("dblclick", reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig]);

  const d = rig.radius / FRAME_FILL;
  // Trackball rather than orbit controls: free rotation on every axis
  return <TrackballControls ref={controls} rotateSpeed={3} noPan dynamicDampingFactor={0.15} minDistance={d * 1.2} maxDistance={d * 5} />;
}

function CarScene({ state }: { state: VehicleState | null }) {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useMemo(() => buildRig(scene), [scene]);
  useEffect(() => () => disposeRig(rig), [rig]);

  const floor = useMemo(() => {
    const grid = new THREE.PolarGridHelper(rig.radius * 1.05, 16, 5, 96, BLUE, BLUE);
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.12;
    return grid;
  }, [rig]);

  void state;
  return (
    <>
      <primitive object={rig.root} />
      <primitive object={floor} />
      <CameraRig rig={rig} />
    </>
  );
}

export default function Car3D({ state }: { state: VehicleState | null }) {
  return (
    <>
      <Canvas camera={{ fov: 35, near: 0.1, far: 200 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <CarScene state={state} />
      </Canvas>
      {/* CC BY 4.0 attribution for the model (see public/models/CREDITS.md) */}
      <div style={{ position: "absolute", bottom: "12px", left: 0, right: 0, textAlign: "center", fontSize: "8px", letterSpacing: "0.08em", color: "rgba(139,144,160,0.55)", fontFamily: "Space Grotesk, system-ui", pointerEvents: "none" }}>
        3D model: CarConcept © Darmstadt Graphics Group, CC BY 4.0
      </div>
    </>
  );
}

useGLTF.preload(MODEL_URL);
