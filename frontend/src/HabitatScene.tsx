import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { ThemeContext, themes, useTheme } from './themes'
import { ClusterStructure, PodShell, SoftBox } from './ThemeGeometry'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { highlightedIds, pods, resources } from './demo'
import type { Resource, ResourceKind } from './demo'

type Props = {
  selected: string | null
  kind: ResourceKind | 'All'
  motion: boolean
  focusRevision: number
  onSelect: (id: string) => void
}

function CameraRig({
  selected,
  motion,
  focusRevision,
}: Pick<Props, 'selected' | 'motion' | 'focusRevision'>) {
  const { camera, gl, invalidate } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const animate = useRef(motion)
  const moving = useRef(true)
  const destination = useRef(new Vector3(11, 9, 12))
  const target = useRef(new Vector3(0, 0.8, 0))
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = animate.current
    orbit.minDistance = 3
    orbit.maxDistance = 26
    orbit.maxPolarAngle = Math.PI / 2.05
    const stopGuidance = () => {
      moving.current = false
    }
    const changed = () => invalidate()
    orbit.addEventListener('start', stopGuidance)
    orbit.addEventListener('change', changed)
    controls.current = orbit
    return () => {
      orbit.removeEventListener('start', stopGuidance)
      orbit.removeEventListener('change', changed)
      orbit.dispose()
    }
  }, [camera, gl, invalidate])
  useEffect(() => {
    animate.current = motion
    if (controls.current) controls.current.enableDamping = motion
    if (!motion) moving.current = false
    invalidate()
  }, [motion, invalidate])
  useEffect(() => {
    const resource = resources.find((item) => item.id === selected)
    const position = resource && resource.kind !== 'Namespace' ? resource.position : [0, 0.8, 0]
    target.current.set(...(position as [number, number, number]))
    const close = resource && (resource.kind === 'Pod' || resource.kind === 'Container')
    destination.current
      .copy(target.current)
      .add(new Vector3(close ? 3.5 : 11, close ? 2.6 : 8.2, close ? 4 : 12))
    if (!animate.current && controls.current) {
      camera.position.copy(destination.current)
      controls.current.target.copy(target.current)
      controls.current.update()
    }
    moving.current = animate.current
    invalidate()
  }, [selected, focusRevision, invalidate, camera])
  useFrame((_, delta) => {
    if (!controls.current) return
    if (moving.current) {
      const amount = 1 - Math.exp(-5 * Math.min(delta, 0.1))
      camera.position.lerp(destination.current, amount)
      controls.current.target.lerp(target.current, amount)
      if (
        camera.position.distanceTo(destination.current) < 0.02 &&
        controls.current.target.distanceTo(target.current) < 0.02
      )
        moving.current = false
      invalidate()
    }
    controls.current.update()
  })
  return null
}

function Box({
  position,
  size,
  color,
  opacity = 1,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  opacity?: number
}) {
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={0.55}
        roughness={0.4}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

function Pod({
  resource,
  highlighted,
  selectedContainer,
  motion,
  onSelect,
}: {
  resource: Resource
  highlighted: boolean
  selectedContainer: boolean
  motion: boolean
  onSelect: Props['onSelect']
}) {
  const { theme } = useTheme()
  const palette = themes[theme]
  const group = useRef<Group>(null)
  const ready = resource.state === 'Ready'
  const container = resources.find((item) => item.parent === resource.id)!
  useFrame(({ clock }, delta) => {
    if (!group.current || !motion || !ready) return
    group.current.position.y =
      resource.position[1] + Math.sin(clock.elapsedTime * 1.1 + resource.position[0]) * 0.12
    group.current.rotation.y += Math.min(delta, 0.1) * 0.22
  })
  const selectPod = (event: ThreeEvent<MouseEvent>) => {
    // Wireframe meshes still raycast their faces. Prefer an inner box hit so the shell cannot hide its container.
    const innerBoxHit = event.intersections.some(
      (hit) => hit.object.userData.resourceId === container.id,
    )
    event.stopPropagation()
    onSelect(innerBoxHit ? container.id : resource.id)
  }
  const selectContainer = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(container.id)
  }
  return (
    <>
      <mesh position={[resource.position[0], 0.65, resource.position[2]]}>
        <cylinderGeometry args={[0.015, 0.015, 1.05, 8]} />
        <meshStandardMaterial color="#446078" />
      </mesh>
      <group ref={group} position={resource.position}>
        <PodShell
          theme={theme}
          radius={0.76}
          tint={highlighted ? palette.ready : palette.unknown}
          opacity={highlighted ? 1 : 0.35}
          onClick={selectPod}
        />
        <mesh onClick={selectContainer} userData={{ resourceId: container.id }} castShadow>
          {theme === 'garden' ? (
            <SoftBox size={[0.59, 0.59, 0.59]} />
          ) : theme === 'blueprint' ? (
            <cylinderGeometry args={[0.32, 0.32, 0.5, 6]} />
          ) : (
            <boxGeometry args={[0.59, 0.59, 0.59]} />
          )}
          <meshStandardMaterial
            color={ready ? palette.ready : palette.warning}
            metalness={0.5}
            roughness={0.28}
            emissive={selectedContainer ? '#3b847e' : ready ? '#0e2529' : '#59340c'}
            emissiveIntensity={0.7}
          />
        </mesh>
        {!ready && (
          <mesh position={[0, 0.53, 0]}>
            <octahedronGeometry args={[0.13]} />
            <meshStandardMaterial color="#f5b65b" emissive="#a95610" />
          </mesh>
        )}
      </group>
      <mesh position={[resource.position[0], 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.58, 0.63, 48]} />
        <meshBasicMaterial color={ready ? palette.ready : palette.warning} />
      </mesh>
    </>
  )
}

function House({ selected, kind, motion, onSelect }: Props) {
  const { theme } = useTheme()
  const palette = themes[theme]
  const ids = highlightedIds(kind, selected)
  return (
    <group>
      {theme !== 'midnight' ? (
        <ClusterStructure theme={theme} width={10.8} depth={4.9} height={3.2} />
      ) : (
        <>
          <Box position={[0, -0.13, 0]} size={[11.3, 0.3, 5.5]} color="#142236" />
          <Box
            position={[0, 1.35, -2.45]}
            size={[10.8, 2.7, 0.12]}
            color="#223952"
            opacity={0.55}
          />
          <Box position={[0, 0.7, 0]} size={[0.09, 1.4, 4.8]} color="#486078" opacity={0.6} />
          {[-5.4, 5.4].flatMap((x) =>
            [-2.45, 2.45].map((z) => (
              <Box
                key={`${x}-${z}`}
                position={[x, 1.6, z]}
                size={[0.12, 3.2, 0.12]}
                color="#556c86"
              />
            )),
          )}
          {[-2.45, 2.45].map((z) => (
            <group key={z}>
              <mesh position={[-2.7, 3.92, z]} rotation={[0, 0, Math.atan2(1.5, 5.4)]}>
                <boxGeometry args={[5.6, 0.1, 0.1]} />
                <meshStandardMaterial color="#7295b8" metalness={0.6} roughness={0.35} />
              </mesh>
              <mesh position={[2.7, 3.92, z]} rotation={[0, 0, -Math.atan2(1.5, 5.4)]}>
                <boxGeometry args={[5.6, 0.1, 0.1]} />
                <meshStandardMaterial color="#7295b8" metalness={0.6} roughness={0.35} />
              </mesh>
            </group>
          ))}
          <Box position={[0, 4.67, 0]} size={[0.1, 0.1, 4.9]} color="#7295b8" />
        </>
      )}
      {resources
        .filter((item) => item.kind === 'Node')
        .map((node) => (
          <mesh
            key={node.id}
            position={[node.position[0], 0.055, 0]}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(node.id)
            }}
            receiveShadow
          >
            <boxGeometry args={[4.9, 0.1, 4.5]} />
            <meshStandardMaterial
              color={ids.has(node.id) ? palette.activeRoom : palette.room}
              metalness={0.2}
              roughness={0.65}
            />
          </mesh>
        ))}
      {pods.map((pod) => (
        <Pod
          key={pod.id}
          resource={pod}
          highlighted={ids.has(pod.id)}
          selectedContainer={selected === resources.find((item) => item.parent === pod.id)?.id}
          motion={motion}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

export function HabitatScene(props: Props) {
  const themeState = useTheme()
  const palette = themes[themeState.theme]
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      frameloop={props.motion ? 'always' : 'demand'}
      camera={{ position: [11, 9, 12], fov: 42 }}
      aria-label="Interactive 3D demonstration of a cluster house with two node rooms and three pods"
    >
      <ThemeContext.Provider value={themeState}>
        <color attach="background" args={[palette.background]} />
        <fog attach="fog" args={[palette.background, 25, 55]} />
        <ambientLight intensity={1.15} />
        <directionalLight
          position={[3, 10, 5]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <pointLight position={[-5, 4, 2]} color="#44c9d4" intensity={15} />
        <House {...props} />
        <gridHelper args={[40, 40, palette.grid, palette.gridMinor]} position={[0, -0.3, 0]} />
        <CameraRig
          selected={props.selected}
          motion={props.motion}
          focusRevision={props.focusRevision}
        />
      </ThemeContext.Provider>
    </Canvas>
  )
}
