"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

// Same palette as the 2D car and the sidebar cards
const AMBER = "#fbbf24";
const GREEN = "#4edea3";
const GRAY = "#8b90a0";
const RED = "#ef4444";
const ORANGE = "#fb923c";
const CYAN = "#67e8f9";
const WARM = "#fbbf24";
const COOL = "#60a5fa";

// Model parts that light up, matched against node names (see partFor)
const PARTS = {
  doors: /^BodyDoor[LR](Color|Handle|Mirror)/,
  childLock: /^InteriorDoor[LR]/,
  hood: /^BodyHood/,
  trunk: /^InteriorRearHatch$|^BodyRearPanelsColor1$/,
  windshield: /^BodyWindshield$/,
  sideWindows: /^BodyDoor[LR]Window$|^BodyWindowsRearSides$/,
  dash: /^InteriorDash/,
  floor: /^BodyUnderside$|^InteriorFloor/,
  wheels: /^Wheel/,
  headlights: /^BodyHeadlights$/,
  taillights: /^BodyTaillights$/,
  seatDriver: /^InteriorSeats\w*Left$/,
  seatPassenger: /^InteriorSeats\w*Right$/,
} as const;
type PartName = keyof typeof PARTS;

// Body ride height per suspension level, as a fraction of the car's height
const RIDE_HEIGHT: Record<string, number> = { entry: -0.05, low: -0.035, standard: 0, high: 0.05 };
const HOOD_OPEN_ANGLE = 0.9; // radians

export interface CarRig {
  root: THREE.Group;
  centre: THREE.Vector3;
  radius: number;
  height: number;
  front: THREE.Vector3;  // unit vector towards the headlights
  left: THREE.Vector3;   // unit vector towards the driver's (left) door
  meshes: THREE.Mesh[];
  partOf: Map<THREE.Mesh, PartName>;
  body: THREE.Group;     // everything except the wheels: rides up and down with the suspension
  hinge: THREE.Group;    // the hood's pivot at its windshield edge
  hoodOpenSign: number;
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

/** The part a mesh belongs to: its own name decides first, then the nearest named ancestor (parts are nested, e.g. headlights sit under the hood). */
function partFor(mesh: THREE.Object3D, stop: THREE.Object3D): PartName | undefined {
  const names = Object.keys(PARTS) as PartName[];
  for (let p: THREE.Object3D | null = mesh; p && p !== stop; p = p.parent) {
    const part = names.find(name => PARTS[name].test(p!.name));
    if (part) return part;
  }
  return undefined;
}

/** The model's seat meshes each span both seats, so split them into left (driver) and right (passenger) halves. */
function splitSeatsBySide(model: THREE.Object3D, centre: THREE.Vector3, left: THREE.Vector3) {
  const seats: THREE.Mesh[] = [];
  model.traverse(o => { if ((o as THREE.Mesh).isMesh && /^InteriorSeats/.test(o.name)) seats.push(o as THREE.Mesh); });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const seat of seats) {
    const pos = seat.geometry.getAttribute("position");
    const index = seat.geometry.index;
    const count = index ? index.count : pos.count;
    const sides: Record<"Left" | "Right", number[]> = { Left: [], Right: [] };
    for (let i = 0; i < count; i += 3) {
      const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      const centroid = a.add(b).add(c).divideScalar(3).applyMatrix4(seat.matrixWorld);
      sides[centroid.sub(centre).dot(left) >= 0 ? "Left" : "Right"].push(i0, i1, i2);
    }
    for (const side of ["Left", "Right"] as const) {
      if (!sides[side].length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", pos);
      geometry.setIndex(sides[side]);
      const half = new THREE.Mesh(geometry);
      half.name = `${seat.name}${side}`;
      half.position.copy(seat.position); half.quaternion.copy(seat.quaternion); half.scale.copy(seat.scale);
      seat.parent!.add(half);
    }
    seat.removeFromParent();
  }
}

/** Normalise the model (size, floor at y=0, centred) and work out its front and left directions. */
function buildRig(scene: THREE.Group): CarRig {
  const model = scene.clone(true);
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
  const height = box.getSize(new THREE.Vector3()).y;
  const horizontal = (v: THREE.Vector3) => v.setY(0).normalize();
  const head = centreOf(model.getObjectByName("BodyHeadlights"));
  const door = centreOf(model.getObjectByName("BodyDoorLColor1"));
  const front = head ? horizontal(head.sub(centre)) : new THREE.Vector3(0, 0, 1);
  const towardsDoor = door ? horizontal(door.sub(centre)) : new THREE.Vector3(1, 0, 0);
  const left = towardsDoor.addScaledVector(front, -towardsDoor.dot(front)).normalize(); // perpendicular to front

  splitSeatsBySide(model, centre, left);
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  model.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  meshes.forEach(hologramMaterials);

  const partOf = new Map<THREE.Mesh, PartName>();
  for (const mesh of meshes) {
    const part = partFor(mesh, model);
    if (part) partOf.set(mesh, part);
  }
  const found = new Set(partOf.values());
  (Object.keys(PARTS) as PartName[]).filter(p => !found.has(p)).forEach(p => console.warn(`[Car3D] no model part found for "${p}"`));

  // Body (everything but the wheels) rides on the suspension; the hood hangs on a hinge at its windshield edge
  const body = new THREE.Group();
  root.add(body);
  const hoodMeshes = meshes.filter(m => partOf.get(m) === "hood");
  const hoodBox = new THREE.Box3();
  hoodMeshes.forEach(m => hoodBox.expandByObject(m));
  const hoodHalfLength = Math.abs(hoodBox.getSize(new THREE.Vector3()).dot(front)) / 2;
  const hinge = new THREE.Group();
  hinge.position.copy(hoodBox.getCenter(new THREE.Vector3())).addScaledVector(front, -hoodHalfLength).setY(hoodBox.max.y);
  body.add(hinge);
  root.updateMatrixWorld(true);
  meshes.filter(m => partOf.get(m) !== "wheels").forEach(m => (partOf.get(m) === "hood" ? hinge : body).attach(m));

  // Pick the rotation direction that lifts the hood's front edge
  hinge.quaternion.setFromAxisAngle(left, 0.2);
  hinge.updateMatrixWorld(true);
  const hoodOpenSign = new THREE.Box3().setFromObject(hinge).max.y > hoodBox.max.y + 1e-4 ? 1 : -1;
  hinge.quaternion.identity();

  return { root, centre, radius, height, front, left, meshes, partOf, body, hinge, hoodOpenSign };
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

interface Look { color: string; fill: number; edge: number }

const seatLook = (heat: number, vent: number): Look =>
  heat > 0 ? { color: ORANGE, fill: 0.08 + heat * 0.06, edge: 0.5 + heat * 0.12 }
  : vent > 0 ? { color: CYAN, fill: 0.08 + vent * 0.05, edge: 0.5 + vent * 0.12 }
  : { color: BLUE, fill: 0.03, edge: 0.14 }; // idle seats stay faint so the cabin isn't cluttered

/** How each part should look for the current vehicle state; parts not listed keep the base hologram look. */
function partLooks(s: VehicleState | null): Partial<Record<PartName, Look>> {
  if (!s) return {};
  const looks: Partial<Record<PartName, Look>> = {};
  const awake = s.is_locked === false;
  if (s.is_locked) looks.doors = { color: AMBER, fill: 0.1, edge: 0.85 };
  if (s.child_lock_on) looks.childLock = { color: AMBER, fill: 0.14, edge: 0.9 };
  if (s.frunk_open) looks.hood = { color: AMBER, fill: 0.16, edge: 0.9 };
  if (s.trunk_open) looks.trunk = { color: AMBER, fill: 0.16, edge: 0.9 };
  if (s.climate_on) {
    // Same warm/cool split and strength curve as the 2D car's windshield tint
    const t = s.climate_temp ?? 22;
    const strength = t < 18 ? 0.65 : t < 22 ? 0.55 : t < 26 ? 0.5 : 0.6;
    looks.windshield = { color: t > 23 ? WARM : COOL, fill: strength * 0.4, edge: 0.85 };
  }
  if (s.air_purification_on) looks.sideWindows = { color: GREEN, fill: 0.14, edge: 0.8 };
  if (s.recirculation_on) looks.dash = { color: BLUE, fill: 0.12, edge: 0.7 };
  if (s.is_preconditioning) looks.floor = { color: GREEN, fill: 0.1, edge: 0.55 };
  const level = s.suspension_level?.toLowerCase();
  if (level === "high") looks.wheels = { color: GREEN, fill: FILL_OPACITY, edge: 0.8 };
  else if (level === "low" || level === "entry") looks.wheels = { color: GRAY, fill: FILL_OPACITY, edge: 0.6 };
  looks.headlights = awake ? { color: "#ffffff", fill: 0.55, edge: 1 } : { color: BLUE, fill: 0.08, edge: 0.6 };
  looks.taillights = { color: RED, fill: awake ? 0.45 : 0.15, edge: awake ? 1 : 0.6 };
  looks.seatDriver = seatLook(s.seat_heating_driver ?? 0, s.seat_ventilation_driver ?? 0);
  looks.seatPassenger = seatLook(s.seat_heating_passenger ?? 0, s.seat_ventilation_passenger ?? 0);
  return looks;
}

/** One animation step: eases every part towards its look and moves the hood and suspension. */
function stepCar(rig: CarRig, state: VehicleState | null, looks: Partial<Record<PartName, Look>>, hood: { angle: number }, dt: number) {
  const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
  hood.angle += ((state?.frunk_open ? HOOD_OPEN_ANGLE : 0) - hood.angle) * k;
  rig.hinge.quaternion.setFromAxisAngle(rig.left, rig.hoodOpenSign * hood.angle);
  const ride = (RIDE_HEIGHT[state?.suspension_level?.toLowerCase() ?? "standard"] ?? 0) * rig.height;
  rig.body.position.y += (ride - rig.body.position.y) * k;

  const target = new THREE.Color();
  for (const mesh of rig.meshes) {
    const part = rig.partOf.get(mesh);
    const look = part ? looks[part] : undefined;
    const fill = mesh.material as THREE.MeshBasicMaterial;
    const edges = mesh.children.find(c => c.name.endsWith("__edges")) as THREE.LineSegments | undefined;
    target.set(look?.color ?? BLUE);
    fill.color.lerp(target, k);
    fill.opacity += ((look?.fill ?? FILL_OPACITY) - fill.opacity) * k;
    if (edges) {
      const edge = edges.material as THREE.LineBasicMaterial;
      edge.color.lerp(target, k);
      edge.opacity += ((look?.edge ?? edges.userData.baseOpacity) - edge.opacity) * k;
    }
  }
}

/** Animates the car towards the current vehicle state every frame. */
function CarAnimator({ rig, state }: { rig: CarRig; state: VehicleState | null }) {
  const hood = useMemo(() => ({ angle: 0 }), []);
  const looks = useMemo(() => partLooks(state), [state]);
  useFrame((_, dt) => stepCar(rig, state, looks, hood, dt));
  return null;
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

  return (
    <>
      <primitive object={rig.root} />
      <primitive object={floor} />
      <CarAnimator rig={rig} state={state} />
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
