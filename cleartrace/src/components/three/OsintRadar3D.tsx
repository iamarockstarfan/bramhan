import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ShieldCheck } from 'lucide-react';

interface OsintRadar3DProps {
  className?: string;
}

const _pointerTarget = new THREE.Vector2(0, 0);
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();

export function OsintRadar3D({ className = '' }: OsintRadar3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        setFallbackActive(true);
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      setFallbackActive(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setFallbackActive(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#FAF7F7');
    scene.fog = new THREE.Fog('#FAF7F7', 9, 20);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 1.35, 6.2);
    camera.lookAt(0, 0.05, 0);

    // Procedural Studio Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xfff5f5, 0xe2e8f0, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf8, 2.0);
    keyLight.position.set(4.5, 6.5, 5.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfca5a5, 1.35);
    rimLight.position.set(-4.5, 2.5, -4.0);
    scene.add(rimLight);

    // Composite 3D Subject Group (9 distinct parts)
    const rootGroup = new THREE.Group();
    rootGroup.position.set(0, 0.15, 0);
    scene.add(rootGroup);

    const disposables: Array<{ dispose: () => void }> = [envTexture];

    // 1. Central Crimson Core (Primary silhouette inner heart)
    const coreGeo = new THREE.OctahedronGeometry(0.62, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xdc2626,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.35,
      metalness: 0.35,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = true;
    rootGroup.add(coreMesh);
    disposables.push(coreGeo, coreMat);

    // 2. Outer Frosted Crystal Polyhedron Shell
    const shellGeo = new THREE.IcosahedronGeometry(0.98, 1);
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.16,
      transmission: isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: isSoftwareGl ? 0.38 : 0.92,
      ior: 1.48,
      thickness: 0.8,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    shellMesh.renderOrder = 2;
    rootGroup.add(shellMesh);
    disposables.push(shellGeo, shellMat);

    // 3. Precision Crimson Wireframe Cage
    const cageGeo = new THREE.IcosahedronGeometry(1.06, 1);
    const cageEdges = new THREE.EdgesGeometry(cageGeo);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.42,
    });
    const cageLines = new THREE.LineSegments(cageEdges, cageMat);
    rootGroup.add(cageLines);
    disposables.push(cageGeo, cageEdges, cageMat);

    // 4. Primary Crimson Gyroscopic Scan Ring
    const ring1Geo = new THREE.TorusGeometry(1.52, 0.036, 20, 96);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.65,
      roughness: 0.24,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI * 0.36;
    ring1.rotation.y = Math.PI * 0.12;
    ring1.castShadow = true;
    rootGroup.add(ring1);
    disposables.push(ring1Geo, ring1Mat);

    // 5. Secondary Brushed Silver-Titanium Orbital Ring
    const ring2Geo = new THREE.TorusGeometry(1.86, 0.026, 20, 110);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.85,
      roughness: 0.2,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI * 0.28;
    ring2.rotation.z = Math.PI * 0.22;
    ring2.castShadow = true;
    rootGroup.add(ring2);
    disposables.push(ring2Geo, ring2Mat);

    // 6. Outer Rose-Coral Horizon Sweep Ring
    const ring3Geo = new THREE.TorusGeometry(2.15, 0.018, 16, 120);
    const ring3Mat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      metalness: 0.45,
      roughness: 0.32,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.x = Math.PI * 0.46;
    rootGroup.add(ring3);
    disposables.push(ring3Geo, ring3Mat);

    // 7. Instanced Orbital Signal Nodes (14 nodes across orbital tracks)
    const nodeCount = 14;
    const nodeGeo = new THREE.SphereGeometry(0.068, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.25,
    });
    const nodesInstanced = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
    nodesInstanced.frustumCulled = false;
    const palette = [
      new THREE.Color(0xdc2626),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xf97316),
      new THREE.Color(0x10b981),
    ];
    for (let i = 0; i < nodeCount; i++) {
      nodesInstanced.setColorAt(i, palette[i % palette.length]);
    }
    if (nodesInstanced.instanceColor) {
      nodesInstanced.instanceColor.needsUpdate = true;
    }
    rootGroup.add(nodesInstanced);
    disposables.push(nodeGeo, nodeMat);

    // 8. Ground Calibration Pedestal Disc & Concentric Floor Ring
    const floorRingGeo = new THREE.RingGeometry(1.4, 2.35, 64);
    floorRingGeo.rotateX(-Math.PI / 2);
    const floorRingMat = new THREE.MeshStandardMaterial({
      color: 0xfee2e2,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
    floorRing.position.y = -1.78;
    floorRing.receiveShadow = true;
    scene.add(floorRing);
    disposables.push(floorRingGeo, floorRingMat);

    // 9. Soft Contact Ground Shadow Disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 120);
      grad.addColorStop(0, 'rgba(15, 23, 42, 0.18)');
      grad.addColorStop(0.55, 'rgba(220, 38, 38, 0.07)');
      grad.addColorStop(1, 'rgba(250, 247, 247, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 256, 256);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const shadowGeo = new THREE.PlaneGeometry(5.2, 5.2);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.y = -1.8;
    scene.add(shadowPlane);
    disposables.push(shadowTex, shadowGeo, shadowMat);

    // Pointer interaction
    let boostVelocity = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
      _pointerTarget.set(nx, ny);
    };
    const onPointerLeave = () => {
      _pointerTarget.set(0, 0);
    };
    const onClick = () => {
      boostVelocity = 1.6;
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('click', onClick);

    // Resize observer
    const handleResize = () => {
      const w = container.clientWidth || 520;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // WebGL context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackActive(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Animation loop with Software-WebGL afterDraw pacing
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const updateScene = (delta: number, elapsed: number) => {
      if (prefersReducedMotion) return;

      boostVelocity = THREE.MathUtils.damp(boostVelocity, 0, 3.2, delta);
      const speedMult = 1 + boostVelocity;

      coreMesh.rotation.y += delta * 0.55 * speedMult;
      coreMesh.rotation.x += delta * 0.25 * speedMult;

      shellMesh.rotation.y -= delta * 0.22 * speedMult;
      cageLines.rotation.y -= delta * 0.22 * speedMult;
      cageLines.rotation.z += delta * 0.12 * speedMult;

      ring1.rotation.z += delta * 0.45 * speedMult;
      ring2.rotation.y -= delta * 0.32 * speedMult;
      ring3.rotation.z += delta * 0.18 * speedMult;

      rootGroup.position.y = 0.15 + Math.sin(elapsed * 1.4) * 0.08;
      rootGroup.rotation.y = THREE.MathUtils.damp(
        rootGroup.rotation.y,
        _pointerTarget.x * 0.45,
        4.5,
        delta
      );
      rootGroup.rotation.x = THREE.MathUtils.damp(
        rootGroup.rotation.x,
        _pointerTarget.y * 0.25,
        4.5,
        delta
      );

      for (let i = 0; i < nodeCount; i++) {
        const angle = elapsed * (0.45 + (i % 3) * 0.2) + (i * Math.PI * 2) / nodeCount;
        const radius = i % 3 === 0 ? 1.52 : i % 3 === 1 ? 1.86 : 2.15;
        const tilt = i % 3 === 0 ? 0.65 : i % 3 === 1 ? -0.52 : 0.28;
        _dummyPos.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * Math.sin(tilt) * radius * 0.6,
          Math.sin(angle) * radius
        );
        const s = 0.85 + Math.sin(elapsed * 2 + i) * 0.18;
        _dummyScale.set(s, s, s);
        _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
        nodesInstanced.setMatrixAt(i, _dummyMatrix);
      }
      nodesInstanced.instanceMatrix.needsUpdate = true;
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      updateScene(delta, elapsed);
      renderer.render(scene, camera);

      if (prefersReducedMotion) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (fallbackActive) {
    return (
      <div
        className={`w-full h-full min-h-[340px] bg-gradient-to-br from-rose-50 via-white to-red-50 flex flex-col items-center justify-center p-8 text-center ${className}`}
      >
        <ShieldCheck className="w-12 h-12 text-[#DC2626] mb-3" />
        <p className="text-sm font-semibold text-slate-900">
          ClearTrace Identity Radar
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-[360px] ${className}`}>
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D email OSINT radar core"
      />
      <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-medium text-slate-500">
        <span>Interactive 3D Footprint Core</span>
        <span>Move cursor or click to pulse</span>
      </div>
    </div>
  );
}
