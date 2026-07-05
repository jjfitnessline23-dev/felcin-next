"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

type Muscle = "chest"|"shoulders"|"biceps"|"triceps"|"forearms"|"abs"|"quads"|"hamstrings"|"calves"|"glutes"|"lats"|"traps";

function classify(name: string, target?: string): { p: Muscle[]; s: Muscle[] } {
  const n = name.toLowerCase();
  if (/bench|chest.?press|push.?up|pushup|incline|decline|fly|flye/.test(n)) return { p:["chest"],                s:["triceps","shoulders"] };
  if (/shoulder.?press|overhead|ohp|military|arnold|lateral.?raise|front.?raise/.test(n)) return { p:["shoulders"], s:["triceps","traps"] };
  if (/tricep|skull|close.?grip|pushdown|dip/.test(n))           return { p:["triceps"],              s:["shoulders"] };
  if (/pull.?up|chin.?up|lat.?pull|pull.?down/.test(n))          return { p:["lats","biceps"],        s:["traps","shoulders"] };
  if (/row|bent.?over|cable.?row|seated.?row/.test(n))           return { p:["lats","traps"],         s:["biceps","shoulders"] };
  if (/curl|bicep|hammer|preacher/.test(n))                      return { p:["biceps"],               s:["forearms"] };
  if (/squat|goblet|leg.?press|lunge|step.?up|bulgarian/.test(n))return { p:["quads","glutes"],       s:["hamstrings","calves"] };
  if (/deadlift|rdl|romanian|sumo|hip.?hinge/.test(n))           return { p:["hamstrings","glutes"],  s:["lats","traps","calves"] };
  if (/leg.?curl|hamstring/.test(n))                             return { p:["hamstrings"],           s:["glutes","calves"] };
  if (/calf.?raise|calves/.test(n))                              return { p:["calves"],               s:[] };
  if (/plank|crunch|ab|sit.?up|core/.test(n))                    return { p:["abs"],                  s:[] };
  if (/run|jog|treadmill|cycling|bike|cardio|elliptical/.test(n))return { p:["quads","calves"],       s:["hamstrings","glutes"] };
  if (target) {
    const t = target.toLowerCase();
    const m: Record<string, Muscle[]> = {
      "pectorals":["chest"],"chest":["chest"],"quadriceps":["quads"],"quads":["quads"],
      "biceps":["biceps"],"biceps brachii":["biceps"],"triceps":["triceps"],"triceps brachii":["triceps"],
      "deltoids":["shoulders"],"shoulders":["shoulders"],"abdominals":["abs"],"abs":["abs"],
      "hamstrings":["hamstrings"],"glutes":["glutes"],"gluteus maximus":["glutes"],
      "calves":["calves"],"lats":["lats"],"latissimus dorsi":["lats"],"traps":["traps"],"trapezius":["traps"],
      "upper legs":["quads","hamstrings"],
    };
    return { p: m[t] || [], s: [] };
  }
  return { p: [], s: [] };
}

const W = 240, H = 360;

// Lathe profile helper: returns Vector2 array for rotation around Y axis
const profile = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

function buildMannequin(scene: THREE.Scene, prim: Muscle[], sec: Muscle[]) {
  const phys = (hex: number, emit?: THREE.Color, emitI = 0) => new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.38, metalness: 0.04,
    clearcoat: 0.85, clearcoatRoughness: 0.15,
    reflectivity: 0.5,
    ...(emit ? { emissive: emit, emissiveIntensity: emitI } : {}),
  });

  const ORANGE = new THREE.Color(0xf97316);
  const BLUE   = new THREE.Color(0x3b82f6);
  const BASE   = 0xd8dcea;

  const mat = (m: Muscle) => {
    if (prim.includes(m)) return phys(0xff6a00, ORANGE, 1.6);
    if (sec.includes(m))  return phys(0x1d6ef5, BLUE, 1.0);
    return phys(BASE);
  };
  const base = phys(BASE);

  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz;
    o.castShadow = true; o.receiveShadow = true;
    scene.add(o);
    return o;
  };

  // HEAD
  mesh(new THREE.SphereGeometry(0.115, 24, 18), base, 0, 1.62, 0);
  // Face slight protrusion
  const faceGeo = new THREE.SphereGeometry(0.095, 16, 12);
  faceGeo.scale(1, 0.88, 0.72);
  mesh(faceGeo, base, 0, 1.612, 0.06);

  // NECK
  mesh(new THREE.CylinderGeometry(0.053, 0.063, 0.14, 16), base, 0, 1.49, 0);

  // TORSO — LatheGeometry for organic chest/waist/hip shape
  const torsoProfile = profile([
    [0.155, 0.00], [0.150, 0.04], [0.138, 0.10], // hip/waist
    [0.143, 0.16], [0.162, 0.24], [0.172, 0.32], // chest
    [0.170, 0.38], [0.155, 0.44], [0.08, 0.50],  // shoulder slope
  ]);
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 24);
  // Apply chest mat if primary, otherwise base
  const torsoMat = prim.includes("chest") ? mat("chest") :
                   prim.includes("abs") ? mat("abs") :
                   sec.includes("chest") ? mat("chest") : base;
  mesh(torsoGeo, torsoMat, 0, 0.58, 0);

  // LATS overlay on sides
  const latGeo = new THREE.SphereGeometry(0.09, 12, 10);
  latGeo.scale(0.7, 1.4, 0.8);
  mesh(latGeo, mat("lats"), -0.20, 1.08, -0.03);
  mesh(latGeo, mat("lats"),  0.20, 1.08, -0.03);

  // ABS overlay (front of torso)
  if (prim.includes("abs") || sec.includes("abs")) {
    const absGeo = new THREE.BoxGeometry(0.18, 0.22, 0.04);
    mesh(absGeo, mat("abs"), 0, 0.82, 0.13);
  }

  // TRAPS
  const trapGeo = new THREE.SphereGeometry(0.058, 10, 8);
  trapGeo.scale(1.3, 0.8, 1.2);
  mesh(trapGeo, mat("traps"), -0.095, 1.43, -0.02);
  mesh(trapGeo, mat("traps"),  0.095, 1.43, -0.02);

  // SHOULDERS
  const sGeo = new THREE.SphereGeometry(0.092, 16, 12);
  mesh(sGeo, mat("shoulders"), -0.245, 1.33, 0.01);
  mesh(sGeo, mat("shoulders"),  0.245, 1.33, 0.01);

  // UPPER ARMS — LatheGeometry
  const uaProfile = profile([
    [0.040, 0.00], [0.062, 0.08], [0.070, 0.18], [0.066, 0.28], [0.055, 0.35],
  ]);
  const uaGeo = new THREE.LatheGeometry(uaProfile, 16);
  // Bicep front, tricep back — use the prominent one
  const armMat = prim.includes("biceps") ? mat("biceps") :
                 prim.includes("triceps") ? mat("triceps") :
                 sec.includes("biceps") ? mat("biceps") :
                 sec.includes("triceps") ? mat("triceps") : base;
  mesh(uaGeo, armMat, -0.33, 0.93, 0, 0,  0.13);
  mesh(uaGeo, armMat,  0.33, 0.93, 0, 0, -0.13);

  // ELBOWS
  mesh(new THREE.SphereGeometry(0.048, 12, 10), base, -0.355, 0.90, 0);
  mesh(new THREE.SphereGeometry(0.048, 12, 10), base,  0.355, 0.90, 0);

  // FOREARMS — LatheGeometry
  const faProfile = profile([
    [0.030, 0.00], [0.050, 0.08], [0.055, 0.16], [0.050, 0.24], [0.038, 0.30],
  ]);
  const faGeo = new THREE.LatheGeometry(faProfile, 14);
  mesh(faGeo, mat("forearms"), -0.375, 0.67, 0, 0,  0.07);
  mesh(faGeo, mat("forearms"),  0.375, 0.67, 0, 0, -0.07);

  // HANDS
  const handGeo = new THREE.SphereGeometry(0.042, 10, 8);
  handGeo.scale(1, 0.85, 0.75);
  mesh(handGeo, base, -0.390, 0.50, 0);
  mesh(handGeo, base,  0.390, 0.50, 0);

  // HIPS connector
  mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.06, 16), base, 0, 0.57, 0);

  // THIGHS — LatheGeometry (organic taper)
  const thighProfile = profile([
    [0.065, 0.00], [0.085, 0.08], [0.098, 0.18], [0.100, 0.28],
    [0.094, 0.36], [0.080, 0.42],
  ]);
  const thighGeo = new THREE.LatheGeometry(thighProfile, 18);
  const thighMat = prim.includes("quads") ? mat("quads") :
                   prim.includes("hamstrings") ? mat("hamstrings") :
                   sec.includes("quads") ? mat("quads") :
                   sec.includes("hamstrings") ? mat("hamstrings") : base;
  mesh(thighGeo, thighMat, -0.115, 0.13, 0);
  mesh(thighGeo, thighMat,  0.115, 0.13, 0);

  // KNEES
  const kneeGeo = new THREE.SphereGeometry(0.068, 14, 10);
  mesh(kneeGeo, base, -0.113, -0.315, 0);
  mesh(kneeGeo, base,  0.113, -0.315, 0);

  // CALVES — LatheGeometry
  const calfProfile = profile([
    [0.038, 0.00], [0.060, 0.08], [0.068, 0.14], [0.060, 0.22],
    [0.048, 0.30], [0.038, 0.36],
  ]);
  const calfGeo = new THREE.LatheGeometry(calfProfile, 16);
  mesh(calfGeo, mat("calves"), -0.110, -0.335, 0);
  mesh(calfGeo, mat("calves"),  0.110, -0.335, 0);

  // ANKLES
  mesh(new THREE.SphereGeometry(0.038, 10, 8), base, -0.110, -0.70, 0);
  mesh(new THREE.SphereGeometry(0.038, 10, 8), base,  0.110, -0.70, 0);

  // FEET
  const footGeo = new THREE.BoxGeometry(0.088, 0.050, 0.175);
  mesh(footGeo, base, -0.110, -0.745, 0.055);
  mesh(footGeo, base,  0.110, -0.745, 0.055);

  // GLUTES (back, slightly visible from 3/4 view)
  if (prim.includes("glutes") || sec.includes("glutes")) {
    const gGeo = new THREE.SphereGeometry(0.10, 12, 10);
    gGeo.scale(1.1, 0.9, 0.75);
    mesh(gGeo, mat("glutes"), -0.08, 0.47, -0.10);
    mesh(gGeo, mat("glutes"),  0.08, 0.47, -0.10);
  }

  // MUSCLE GLOW LIGHTS
  const addGlow = (color: THREE.Color, x: number, y: number, z: number) => {
    const light = new THREE.PointLight(color, 6.0, 0.8);
    light.position.set(x, y, z);
    scene.add(light);
  };
  prim.forEach(m => {
    const pos: Record<Muscle, [number,number,number]> = {
      chest:     [0, 1.05, 0.2], shoulders: [0, 1.33, 0.1],
      biceps:    [0, 1.0, 0.1],  triceps:   [0, 1.0, -0.1],
      forearms:  [0, 0.68, 0.1], abs:       [0, 0.88, 0.16],
      quads:     [0, 0.05, 0.12],hamstrings:[0, 0.05,-0.10],
      calves:    [0,-0.46, 0.08],glutes:    [0, 0.47,-0.08],
      lats:      [0, 1.08, 0],   traps:     [0, 1.42, 0],
    };
    if (pos[m]) addGlow(ORANGE, ...pos[m]);
  });
  sec.forEach(m => {
    const pos: Record<Muscle, [number,number,number]> = {
      chest:     [0, 1.05, 0.15],shoulders: [0, 1.33, 0.08],
      biceps:    [0, 1.0, 0.08], triceps:   [0, 1.0,-0.08],
      forearms:  [0, 0.68, 0.08],abs:       [0, 0.88, 0.14],
      quads:     [0, 0.05, 0.10],hamstrings:[0, 0.05,-0.08],
      calves:    [0,-0.46, 0.06],glutes:    [0, 0.47,-0.06],
      lats:      [0, 1.08, 0],   traps:     [0, 1.42, 0],
    };
    if (pos[m]) addGlow(BLUE, ...pos[m]);
  });
}

export default function MannequinDemo({ exerciseName = "", target = "", secondaryMuscles: sm = [] }: {
  exerciseName?: string; target?: string; secondaryMuscles?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { p: prim, s: sec } = classify(exerciseName, target);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 20);
    camera.position.set(0.55, 0.88, 2.85);
    camera.lookAt(0, 0.7, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2.5, 4, 2.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8855ff, 0.6);
    rim.position.set(-2.5, 2, -2);
    scene.add(rim);
    scene.add(new THREE.DirectionalLight(0xffffff, 0.25)).position.set(-1, 0.5, 2);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 32),
      new THREE.MeshStandardMaterial({ color: 0x08080f, transparent: true, opacity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.802;
    scene.add(floor);

    buildMannequin(scene, prim, sec);

    // Fixed 3/4 front angle — no rotation
    camera.position.set(0.65, 0.95, 2.7);
    camera.lookAt(0, 0.7, 0);
    renderer.render(scene, camera);

    return () => {
      renderer.dispose();
      scene.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach(x => x.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName, target, sm.join(",")]);

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
      <canvas ref={canvasRef} style={{ borderRadius: 14 }} />
    </div>
  );
}
