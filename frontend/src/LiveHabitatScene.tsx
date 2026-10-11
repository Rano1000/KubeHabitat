import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Group, Quaternion, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { namespaceColor, sceneHighlights } from './habitatLayout'
import type { HabitatLayout, PlacedPod, Point } from './habitatLayout'
import type { LiveResource } from './useClusterSnapshot'
import { storageFacts } from './habitatView'

type Props = {
  layout: HabitatLayout
  selected: string | null
  matching: string[]
  motion: boolean
  focusRevision: number
  fresh: (resource: LiveResource) => boolean
  onSelect: (id: string) => void
  layers: { network: boolean; storage: boolean; capacity: boolean }
  policyEdge?: { from: string; to: string; verdict: string }
  overview?: boolean
  endpointsFresh: boolean
}

function Connector({ from, to, tint }: { from: Point; to: Point; tint: string }) {
  const shape = useMemo(() => {
    const start = new Vector3(...from)
    const end = new Vector3(...to)
    const direction = end.clone().sub(start)
    return {
      position: start.add(end).multiplyScalar(0.5),
      length: direction.length(),
      rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
    }
  }, [from.join(':'), to.join(':')])
  return (
    <mesh position={shape.position} quaternion={shape.rotation}>
      <cylinderGeometry args={[0.018, 0.018, shape.length, 6]} />
      <meshBasicMaterial color={tint} transparent opacity={0.6} />
    </mesh>
  )
}

const networkKinds = new Set(['Service', 'EndpointSlice', 'Ingress', 'NetworkPolicy'])

function Infrastructure({
  resource,
  position,
  props,
  highlighted,
}: {
  resource: LiveResource
  position: Point
  props: Props
  highlighted: boolean
}) {
  const storage = !networkKinds.has(resource.kind)
  if (storage ? !props.layers.storage : resource.kind !== 'Service' && !props.layers.network)
    return null
  const tint = !props.fresh(resource)
    ? '#8594a6'
    : resource.kind === 'NetworkPolicy'
      ? '#c1a4ed'
      : storage
        ? '#e4be77'
        : '#79aaf0'
  const choose = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    props.onSelect(resource.id)
  }
  return (
    <group position={position}>
      <mesh onClick={choose}>
        {resource.kind === 'Service' ? (
          <cylinderGeometry args={[0.42, 0.5, 0.28, 6]} />
        ) : resource.kind === 'Volume' ? (
          <cylinderGeometry args={[0.17, 0.17, 0.22, 16]} />
        ) : ['StorageClass', 'ResourceQuota'].includes(resource.kind) ? (
          <boxGeometry args={[0.7, 0.8, 0.18]} />
        ) : storage ? (
          <cylinderGeometry args={[0.42, 0.42, 0.75, 20]} />
        ) : resource.kind === 'NetworkPolicy' ? (
          <boxGeometry args={[0.68, 0.78, 0.18]} />
        ) : (
          <octahedronGeometry args={[0.5]} />
        )}
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={highlighted ? 0.2 : 0}
          transparent
          opacity={highlighted ? 1 : 0.35}
          metalness={0.35}
        />
      </mesh>
      {resource.kind === 'Service' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.28, 0]} onClick={choose}>
            <torusGeometry args={[0.36, 0.035, 8, 24]} />
            <meshBasicMaterial color={tint} />
          </mesh>
          <Label
            text={`SERVICE · ${resource.name}\n${
              props.endpointsFresh &&
              props.fresh(resource) &&
              props.layout.resources
                .filter(
                  (r) =>
                    r.kind === 'EndpointSlice' &&
                    r.namespace === resource.namespace &&
                    r.links?.some((l) => l.kind === 'Service' && l.name === resource.name),
                )
                .every(props.fresh)
                ? `Pod destinations: ${new Set(props.layout.edges.filter((edge) => edge.from === resource.id && props.layout.resources.find((r) => r.id === edge.to)?.kind === 'Pod').map((edge) => edge.to)).size}`
                : 'Destination freshness unknown'
            }`}
            position={[0, 1, 0]}
            width={3.1}
            onClick={choose}
          />
        </>
      )}
      {storage &&
        ['Volume', 'PersistentVolumeClaim', 'PersistentVolume'].includes(resource.kind) &&
        (() => {
          const facts = storageFacts(props.layout.resources, resource)
          return (
            <Label
              text={`${resource.name}\nID ${facts.shortId}\nMin requested: ${facts.minimum}\nCapacity: ${facts.capacity}\nMax limit: ${facts.maximum}`}
              position={[0, resource.kind === 'Volume' ? 0.85 : 1.3, 0]}
              width={2.25}
              onClick={choose}
            />
          )
        })()}
      {['StorageClass', 'ResourceQuota'].includes(resource.kind) && (
        <Label
          text={`${resource.kind === 'StorageClass' ? 'STORAGE CLASS' : 'NAMESPACE QUOTA'} · ${resource.name}\nID ${resource.uid.slice(0, 8)}\n${resource.kind === 'StorageClass' ? 'Min / max: not defined by class' : `Storage quota: ${resource.details?.['quota requests.storage'] ?? 'Not declared'}`}`}
          position={[0, 1.2, 0]}
          width={2.8}
          onClick={choose}
        />
      )}
      {props.selected === resource.id &&
        resource.kind !== 'Service' &&
        ![
          'Volume',
          'PersistentVolumeClaim',
          'PersistentVolume',
          'StorageClass',
          'ResourceQuota',
        ].includes(resource.kind) && (
          <Label text={`${resource.kind} · ${resource.name}`} position={[0, 0.9, 0]} width={3.4} />
        )}
    </group>
  )
}

function color(resource: LiveResource, fresh: boolean) {
  if (!fresh || resource.state === 'Unknown') return '#8594a6'
  if (resource.state === 'Failed') return '#ee7979'
  if (resource.state === 'Terminated' && resource.exitCode !== undefined && resource.exitCode !== 0)
    return '#ee7979'
  if (['Completed', 'Succeeded', 'Terminated'].includes(resource.state)) return '#8cafdf'
  if (resource.ready === false || ['NotReady', 'Waiting', 'Unscheduled'].includes(resource.state))
    return '#f2b65e'
  return resource.ready === true ? '#73dfcf' : '#8cafdf'
}

function Label({
  text,
  position,
  width = 3.5,
  onClick,
}: {
  text: string
  position: Point
  width?: number
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    const lines = text.split('\n')
    canvas.width = 768
    canvas.height = lines.length === 1 ? 96 : lines.length * 54 + 24
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#102134e8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = '500 29px system-ui'
    ctx.fillStyle = '#deebf4'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((line, index) =>
      ctx.fillText(line, 384, lines.length === 1 ? 48 : 39 + index * 54, 730),
    )
    return new CanvasTexture(canvas)
  }, [text])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite
      position={position}
      scale={[width, (width * texture.image.height) / texture.image.width, 1]}
      onClick={onClick}
    >
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  )
}

function Box({
  position,
  size,
  tint,
  opacity = 1,
}: {
  position: Point
  size: Point
  tint: string
  opacity?: number
}) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={tint}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={0.3}
        roughness={0.55}
      />
    </mesh>
  )
}

function CameraRig({
  layout,
  selected,
  matching,
  focusRevision,
  motion,
  overview: overviewRequested,
}: Props) {
  const { camera, gl, invalidate, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const moving = useRef(false)
  const destination = useRef(new Vector3())
  const target = useRef(new Vector3())
  const selectedResource = layout.resources.find((r) => r.id === selected)
  const selectedPod = layout.pods.find(
    (pod) =>
      pod.resource.id === selected ||
      (selectedResource?.kind === 'Container' && selectedResource.parent === pod.resource.id),
  )
  // Keep pod inspection close enough to distinguish its containers; external references stay lit.
  const focusIds = selectedPod
    ? [selectedPod.resource.id, ...selectedPod.containers.map((child) => child.resource.id)]
    : selected
      ? [...sceneHighlights(layout, selected, [])]
      : matching
  const points = focusIds.map((id) => layout.positions.get(id)).filter((p): p is Point => !!p)
  const overview = !selected && (overviewRequested ?? matching.length === layout.resources.length)
  const center: Point =
    overview || !points.length
      ? [0, 0.8, 0]
      : [
          (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2,
          selectedResource?.kind === 'Node'
            ? 0.9
            : points.reduce((n, p) => n + p[1] / points.length, 0),
          (Math.min(...points.map((p) => p[2])) + Math.max(...points.map((p) => p[2]))) / 2,
        ]
  const selectedRoom = layout.rooms.find((r) => r.resource.id === selected)
  const span =
    overview || !points.length
      ? Math.max(layout.width, layout.depth)
      : selectedRoom
        ? Math.max(selectedRoom.width, selectedRoom.depth)
        : Math.max(
            3.4,
            Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])) + 2.5,
            Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2])) + 2.5,
          )
  // Polling revisions must not continually reset an engineer's manual orbit.
  const framing = `${center.join(':')}:${span}:${size.width}:${size.height}`
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.maxPolarAngle = Math.PI / 2.03
    orbit.minDistance = 1.4
    const start = () => {
      moving.current = false
    }
    const change = () => invalidate()
    orbit.addEventListener('start', start)
    orbit.addEventListener('change', change)
    controls.current = orbit
    return () => {
      orbit.removeEventListener('start', start)
      orbit.removeEventListener('change', change)
      orbit.dispose()
    }
  }, [camera, gl, invalidate])
  useEffect(() => {
    if (!controls.current) return
    const orbit = controls.current
    orbit.enableDamping = motion
    orbit.maxDistance = Math.max(35, layout.width * 5, layout.depth * 5)
    target.current.set(...center)
    const distance = span * Math.max(0.95, size.height / size.width)
    destination.current
      .copy(target.current)
      .add(new Vector3(distance, distance * 0.8, distance * 1.1))
    moving.current = motion
    if (!motion) {
      camera.position.copy(destination.current)
      orbit.target.copy(target.current)
      orbit.update()
    }
    invalidate()
    // Coordinates and framing are encoded in the primitive key, not snapshot object references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing, selected, focusRevision, motion, camera, invalidate])
  useFrame((_, delta) => {
    if (!controls.current) return
    if (moving.current) {
      const amount = 1 - Math.exp(-5 * Math.min(delta, 0.1))
      camera.position.lerp(destination.current, amount)
      controls.current.target.lerp(target.current, amount)
      if (camera.position.distanceTo(destination.current) < 0.02) moving.current = false
      invalidate()
    }
    controls.current.update()
  })
  return null
}

function Pod({
  pod,
  props,
  highlighted,
}: {
  pod: PlacedPod
  props: Props
  highlighted: Set<string>
}) {
  const group = useRef<Group>(null)
  const resource = pod.resource
  const alive =
    props.fresh(resource) &&
    resource.ready === true &&
    resource.state === 'Ready' &&
    !resource.deleting
  useEffect(() => {
    if (group.current) {
      group.current.position.set(...pod.position)
      if (!alive) group.current.rotation.y = 0
    }
  }, [pod.position.join(':'), alive])
  useFrame(({ clock }, delta) => {
    if (!group.current || !props.motion || !alive) return
    group.current.position.y = pod.position[1] + Math.sin(clock.elapsedTime + pod.position[0]) * 0.1
    group.current.rotation.y += Math.min(delta, 0.1) * 0.18
  })
  const choosePod = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const inner = event.intersections.find((hit) =>
      pod.containers.some((c) => c.resource.id === hit.object.userData.resourceId),
    )
    props.onSelect(inner ? String(inner.object.userData.resourceId) : resource.id)
  }
  const tint = color(resource, props.fresh(resource))
  const ns = props.layout.resources.find(
    (r) => r.kind === 'Namespace' && r.name === resource.namespace,
  )
  return (
    <>
      <mesh position={[pod.position[0], pod.position[1] / 2, pod.position[2]]}>
        <cylinderGeometry args={[0.013, 0.013, pod.position[1] - 0.1, 6]} />
        <meshStandardMaterial color="#354e65" />
      </mesh>
      <mesh
        position={[pod.position[0], 0.12, pod.position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          props.onSelect(ns?.id ?? resource.id)
        }}
      >
        <ringGeometry args={[pod.radius * 0.78, pod.radius * 0.85, 40]} />
        <meshBasicMaterial color={namespaceColor(resource.namespace ?? '')} />
      </mesh>
      <group ref={group} position={pod.position}>
        <mesh onClick={choosePod}>
          <icosahedronGeometry args={[pod.radius, 1]} />
          <meshStandardMaterial
            color={tint}
            wireframe
            transparent
            opacity={highlighted.has(resource.id) ? 1 : 0.25}
            emissive={tint}
            emissiveIntensity={highlighted.has(resource.id) ? 0.2 : 0}
          />
        </mesh>
        {pod.containers.map((c) => (
          <mesh
            key={c.resource.id}
            position={c.offset}
            onClick={(e) => {
              e.stopPropagation()
              props.onSelect(c.resource.id)
            }}
            userData={{ resourceId: c.resource.id }}
          >
            <boxGeometry
              args={pod.containers.length === 1 ? [0.58, 0.58, 0.58] : [0.37, 0.45, 0.37]}
            />
            <meshStandardMaterial
              color={color(c.resource, props.fresh(c.resource))}
              emissive={color(c.resource, props.fresh(c.resource))}
              emissiveIntensity={highlighted.has(c.resource.id) ? 0.3 : 0}
              transparent
              opacity={highlighted.has(c.resource.id) || highlighted.has(resource.id) ? 1 : 0.35}
              metalness={0.45}
              roughness={0.32}
            />
          </mesh>
        ))}
        {props.selected === resource.id ||
        pod.containers.some((c) => c.resource.id === props.selected) ? (
          <Label text={resource.name} position={[0, pod.radius + 0.35, 0]} width={3.2} />
        ) : null}
      </group>
    </>
  )
}

function House(props: Props) {
  const { layout } = props
  const ids = sceneHighlights(layout, props.selected, props.matching)
  const width = layout.width + 0.7
  const depth = layout.depth + 0.7
  const height = Math.max(3.1, ...layout.pods.map((p) => p.position[1] + p.radius + 0.8))
  const roofRise = Math.min(2, width * 0.16)
  const roofLength = Math.hypot(width / 2, roofRise)
  return (
    <group>
      <Box position={[0, -0.13, 0]} size={[width + 0.4, 0.3, depth + 0.4]} tint="#142639" />
      <Box
        position={[0, height / 2, -depth / 2]}
        size={[width, height, 0.06]}
        tint="#51809b"
        opacity={0.12}
      />
      {[-width / 2, width / 2].flatMap((x) =>
        [-depth / 2, depth / 2].map((z) => (
          <Box
            key={`${x}:${z}`}
            position={[x, height / 2, z]}
            size={[0.08, height, 0.08]}
            tint="#6486a1"
          />
        )),
      )}
      {[-depth / 2, depth / 2].map((z) => (
        <group key={z}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[(side * width) / 4, height + roofRise / 2, z]}
              rotation={[0, 0, -side * Math.atan2(roofRise, width / 2)]}
            >
              <boxGeometry args={[roofLength, 0.07, 0.07]} />
              <meshStandardMaterial color="#7494ad" />
            </mesh>
          ))}
        </group>
      ))}
      <Box position={[0, height + roofRise, 0]} size={[0.07, 0.07, depth]} tint="#7494ad" />
      {layout.rooms.map((room) => (
        <group key={room.resource.id} position={room.position}>
          <mesh
            position={[0, 0.015, 0]}
            onClick={(e) => {
              e.stopPropagation()
              props.onSelect(room.resource.id)
            }}
          >
            <boxGeometry args={[room.width, 0.08, room.depth]} />
            <meshStandardMaterial
              color={ids.has(room.resource.id) ? '#214b5d' : '#192c40'}
              roughness={0.7}
            />
          </mesh>
          <Box
            position={[room.width / 2, 0.65, 0]}
            size={[0.045, 1.3, room.depth]}
            tint="#56809b"
            opacity={0.22}
          />
          <Box
            position={[0, 0.65, -room.depth / 2]}
            size={[room.width, 1.3, 0.045]}
            tint="#56809b"
            opacity={0.22}
          />
          <Label
            text={`${room.resource.name} · ${room.pods.length} pods`}
            position={[0, height - 0.35, -room.depth / 2 + 0.35]}
            width={Math.min(room.width - 0.3, 5)}
            onClick={(e) => {
              e.stopPropagation()
              props.onSelect(room.resource.id)
            }}
          />
          {props.layers.capacity && room.resource.details && (
            <group
              position={[-room.width / 2 + 0.55, 0.3, -room.depth / 2 + 0.8]}
              onClick={(e) => {
                e.stopPropagation()
                props.onSelect(room.resource.id)
              }}
            >
              <Box position={[0, 0, 0]} size={[0.5, 0.22, 0.5]} tint="#79aaf0" />
              <Box position={[0, 0.24, 0]} size={[0.5, 0.18, 0.5]} tint="#73dfcf" />
              <Label
                text={`CPU ${room.resource.details['capacity cpu'] ?? '?'} · RAM ${room.resource.details['capacity memory'] ?? '?'}`}
                position={[0.7, 0.6, 0]}
                width={2.5}
              />
            </group>
          )}
        </group>
      ))}
      {layout.waiting && (
        <group position={layout.waiting.position}>
          <Box
            position={[0, 0.02, 0]}
            size={[layout.waiting.width, 0.1, layout.waiting.depth]}
            tint="#3a3544"
          />
          <Label
            text="Unscheduled / node not observed"
            position={[0, height - 0.35, -layout.waiting.depth / 2 + 0.35]}
            width={4.3}
          />
        </group>
      )}
      {layout.pods.map((pod) => (
        <Pod key={pod.resource.id} pod={pod} props={props} highlighted={ids} />
      ))}
      {layout.objects.map((object) => (
        <Infrastructure
          key={object.resource.id}
          {...object}
          props={props}
          highlighted={ids.has(object.resource.id)}
        />
      ))}
      {layout.edges
        .filter((edge) => {
          const source = layout.resources.find((r) => r.id === edge.from)
          const target = layout.resources.find((r) => r.id === edge.to)
          return (
            source &&
            target &&
            props.fresh(source) &&
            props.fresh(target) &&
            (source.kind === 'Service'
              ? props.endpointsFresh &&
                props.layout.resources
                  .filter(
                    (r) =>
                      r.kind === 'EndpointSlice' &&
                      r.namespace === source.namespace &&
                      r.links?.some((l) => l.kind === 'Service' && l.name === source.name),
                  )
                  .every(props.fresh)
              : networkKinds.has(source.kind)
                ? props.layers.network
                : props.layers.storage) &&
            (!props.selected || ids.has(edge.from) || ids.has(edge.to))
          )
        })
        .map((edge, index) => {
          const from = layout.positions.get(edge.from)
          const to = layout.positions.get(edge.to)
          return from && to ? (
            <Connector
              key={`${edge.from}:${edge.to}:${index}`}
              from={from}
              to={to}
              tint={
                networkKinds.has(layout.resources.find((r) => r.id === edge.from)!.kind)
                  ? '#79aaf0'
                  : '#e4be77'
              }
            />
          ) : null
        })}
      {props.policyEdge &&
        (() => {
          const from = layout.positions.get(props.policyEdge.from)
          const to = layout.positions.get(props.policyEdge.to)
          return from && to ? (
            <Connector
              from={from}
              to={to}
              tint={
                props.policyEdge.verdict === 'Allowed by policy'
                  ? '#73dfcf'
                  : props.policyEdge.verdict === 'Denied by policy'
                    ? '#ee7979'
                    : '#8594a6'
              }
            />
          ) : null
        })()}
      {layout.looseContainers.map((c) => (
        <mesh
          key={c.resource.id}
          position={c.position}
          onClick={(e) => {
            e.stopPropagation()
            props.onSelect(c.resource.id)
          }}
        >
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={color(c.resource, props.fresh(c.resource))} />
        </mesh>
      ))}
    </group>
  )
}

export function LiveHabitatScene(props: Props) {
  const { layout } = props
  const scale = Math.max(layout.width, layout.depth, 12)
  const containers = layout.pods.reduce(
    (n, p) => n + p.containers.length,
    layout.looseContainers.length,
  )
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={props.motion ? 'always' : 'demand'}
      camera={{
        position: [scale, scale * 0.85, scale * 1.15],
        fov: 43,
        far: Math.max(200, scale * 10),
      }}
      aria-label={`Live Kubernetes house with ${layout.rooms.length} node rooms, ${layout.pods.length} pods and ${containers} containers`}
    >
      <color attach="background" args={['#0d1726']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 12, 8]} intensity={2.5} />
      <pointLight position={[-5, 5, 2]} color="#6adde0" intensity={22} />
      <House {...props} />
      <gridHelper
        args={[scale * 4, Math.min(120, Math.ceil(scale * 4)), '#263c51', '#172638']}
        position={[0, -0.3, 0]}
      />
      <CameraRig {...props} />
    </Canvas>
  )
}
