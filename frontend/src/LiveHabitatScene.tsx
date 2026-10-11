import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CanvasTexture,
  Group,
  Quaternion,
  Vector3,
  InstancedMesh,
  Object3D,
  Color,
  SRGBColorSpace,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { namespaceColor, sceneHighlights } from './habitatLayout'
import type { PlacedPod, Point } from './habitatLayout'
import type { LiveResource } from './useClusterSnapshot'
import { storageFacts } from './habitatView'
import { patrolPose, podServices, serviceColor, servicePatrol } from './serviceGuide'
import type { ScaleLayout, Summary, GroupPlacement } from './scaleModel'
import { ThemeContext, themes, useTheme } from './themes'
import type { ThemeId } from './themes'
import { ClusterStructure, PodShell, SoftBox } from './ThemeGeometry'

type Props = {
  theme?: ThemeId
  layout: ScaleLayout
  summaries: Map<string, Summary>
  nodeSummaries: Map<string, Summary>
  groupMembers?: string[]
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

function ServiceGuide({
  resource,
  props,
  highlighted,
}: {
  resource: LiveResource
  props: Props
  highlighted: boolean
}) {
  const guide = useRef<Group>(null)
  const leftArm = useRef<Group>(null),
    rightArm = useRef<Group>(null)
  const leftLeg = useRef<Group>(null),
    rightLeg = useRef<Group>(null)
  const distance = useRef(0)
  const route = useMemo(() => servicePatrol(props.layout, resource.id), [props.layout, resource.id])
  const routeKey = route.points.map((p) => p.join(':')).join('|')
  const observed = props.fresh(resource)
  const destinationsFresh =
    props.endpointsFresh &&
    props.layout.resources
      .filter(
        (r) =>
          r.kind === 'EndpointSlice' &&
          r.namespace === resource.namespace &&
          r.links?.some((l) => l.kind === 'Service' && l.name === resource.name),
      )
      .every(props.fresh)
  const walking = props.motion && observed && destinationsFresh && route.roomIds.length > 0
  const tint = serviceColor(resource)
  const opacity = (highlighted ? 1 : 0.38) * (observed ? 1 : 0.5)
  const destinations = new Set(
    props.layout.edges
      .filter(
        (e) => e.from === resource.id && props.layout.pods.some((p) => p.resource.id === e.to),
      )
      .map((e) => e.to),
  ).size
  useEffect(() => {
    distance.current = 0
    const pose = patrolPose(route.points, 0)
    guide.current?.position.set(...pose.position)
    if (guide.current) guide.current.rotation.y = pose.yaw
  }, [routeKey])
  useFrame((_, delta) => {
    if (!walking || !guide.current) return
    distance.current += Math.min(delta, 0.1) * 0.65
    const pose = patrolPose(route.points, distance.current)
    guide.current.position.set(...pose.position)
    guide.current.rotation.y = pose.yaw
    const stride = Math.sin(distance.current * 9) * 0.4
    if (leftArm.current) leftArm.current.rotation.x = stride
    if (rightArm.current) rightArm.current.rotation.x = -stride
    if (leftLeg.current) leftLeg.current.rotation.x = -stride
    if (rightLeg.current) rightLeg.current.rotation.x = stride
  })
  const choose = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    props.onSelect(resource.id)
  }
  const uniform = (
    <meshStandardMaterial color={tint} transparent opacity={opacity} roughness={0.58} />
  )
  const theme = props.theme ?? 'midnight'
  return (
    <>
      <mesh position={route.points[0]} rotation={[-Math.PI / 2, 0, 0]} onClick={choose}>
        <ringGeometry args={[0.22, 0.28, 24]} />
        <meshBasicMaterial color={tint} transparent opacity={opacity} />
      </mesh>
      <group ref={guide} position={route.points[0]} onClick={choose}>
        <mesh position={[0, 0.8, 0]}>
          {theme === 'blueprint' ? (
            <boxGeometry args={[0.38, 0.48, 0.3]} />
          ) : (
            <capsuleGeometry args={[0.19, 0.24, 4, 12]} />
          )}
          {uniform}
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          {theme === 'blueprint' ? (
            <boxGeometry args={[0.33, 0.28, 0.28]} />
          ) : (
            <sphereGeometry args={[0.17, 16, 12]} />
          )}
          <meshStandardMaterial
            color={observed ? (theme === 'blueprint' ? '#dbe8f4' : '#e2bf9c') : '#9ca3aa'}
            transparent
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, 1.32, 0]}>
          {theme === 'blueprint' ? (
            <boxGeometry args={[0.36, 0.06, 0.3]} />
          ) : (
            <sphereGeometry args={[0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          )}
          {uniform}
        </mesh>
        {theme === 'garden' && (
          <>
            <mesh position={[0, 1.3, 0]}>
              <cylinderGeometry args={[0.29, 0.29, 0.035, 20]} />
              {uniform}
            </mesh>
            <mesh position={[0, 0.84, -0.21]}>
              <SoftBox size={[0.28, 0.32, 0.16]} />
              <meshStandardMaterial color="#b08c56" transparent opacity={opacity} />
            </mesh>
          </>
        )}
        {theme === 'blueprint' && (
          <>
            <mesh position={[0, 1.52, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.25, 6]} />
              {uniform}
            </mesh>
            <mesh position={[0, 1.67, 0]}>
              <octahedronGeometry args={[0.06]} />
              {uniform}
            </mesh>
            <mesh position={[0, 1.2, 0.145]}>
              <boxGeometry args={[0.22, 0.055, 0.015]} />
              <meshBasicMaterial color={tint} />
            </mesh>
          </>
        )}
        <mesh position={[0, 1.32, 0.13]}>
          <boxGeometry args={[0.28, 0.035, 0.16]} />
          {uniform}
        </mesh>
        {[-0.057, 0.057].map((x) => (
          <mesh key={x} position={[x, 1.21, 0.153]}>
            <sphereGeometry args={[0.023, 8, 8]} />
            <meshBasicMaterial color="#243a51" transparent opacity={opacity} />
          </mesh>
        ))}
        <mesh position={[-0.08, 0.86, 0.184]}>
          <circleGeometry args={[0.052, 6]} />
          <meshBasicMaterial color="#f1d18c" transparent opacity={opacity} />
        </mesh>
        {[-1, 1].map((side) => (
          <group
            key={`arm${side}`}
            ref={side < 0 ? leftArm : rightArm}
            position={[side * 0.25, 0.96, 0]}
          >
            <mesh position={[0, -0.18, 0]}>
              {theme === 'blueprint' ? (
                <boxGeometry args={[0.11, 0.36, 0.12]} />
              ) : (
                <capsuleGeometry args={[0.066, 0.26, 4, 8]} />
              )}
              {uniform}
            </mesh>
            <mesh position={[0, -0.36, 0]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshStandardMaterial color="#e2bf9c" transparent opacity={opacity} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group
            key={`leg${side}`}
            ref={side < 0 ? leftLeg : rightLeg}
            position={[side * 0.105, 0.55, 0]}
          >
            <mesh position={[0, -0.21, 0]}>
              {theme === 'blueprint' ? (
                <boxGeometry args={[0.12, 0.4, 0.13]} />
              ) : (
                <capsuleGeometry args={[0.073, 0.29, 4, 8]} />
              )}
              <meshStandardMaterial color={tint} transparent opacity={opacity} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.42, 0.055]}>
              <boxGeometry args={[0.14, 0.1, 0.23]} />
              <meshStandardMaterial color="#182d43" transparent opacity={opacity} />
            </mesh>
          </group>
        ))}
        <Label
          text={`SERVICE · ${resource.name}\n${observed && destinationsFresh ? `${destinations} pod destinations · routing guide` : 'Destination freshness unknown'}`}
          position={[0, 1.75, 0]}
          width={2.9}
          onClick={choose}
        />
      </group>
    </>
  )
}

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
  if (resource.kind === 'Service')
    return <ServiceGuide resource={resource} props={props} highlighted={highlighted} />
  const storage = !networkKinds.has(resource.kind)
  if (storage ? !props.layers.storage : !props.layers.network) return null
  const theme = props.theme ?? 'midnight'
  const tint = !props.fresh(resource)
    ? themes[theme].unknown
    : resource.kind === 'NetworkPolicy'
      ? '#c1a4ed'
      : storage
        ? theme === 'midnight'
          ? '#e4be77'
          : '#b37d35'
        : theme === 'midnight'
          ? '#79aaf0'
          : '#397da9'
  const choose = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    props.onSelect(resource.id)
  }
  return (
    <group position={position}>
      <mesh onClick={choose}>
        {theme === 'garden' ? (
          storage ? (
            <capsuleGeometry
              args={[
                resource.kind === 'Volume' ? 0.17 : 0.36,
                resource.kind === 'Volume' ? 0.1 : 0.35,
                4,
                12,
              ]}
            />
          ) : (
            <sphereGeometry args={[0.46, 16, 12]} />
          )
        ) : theme === 'blueprint' ? (
          storage ? (
            <boxGeometry args={resource.kind === 'Volume' ? [0.35, 0.3, 0.35] : [0.7, 0.7, 0.55]} />
          ) : (
            <cylinderGeometry args={[0.45, 0.45, 0.65, 6]} />
          )
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

function color(resource: LiveResource, fresh: boolean, theme: ThemeId = 'midnight') {
  const palette = themes[theme]
  if (!fresh || resource.state === 'Unknown') return palette.unknown
  if (resource.state === 'Failed') return palette.danger
  if (resource.state === 'Terminated' && resource.exitCode !== undefined && resource.exitCode !== 0)
    return palette.danger
  if (['Completed', 'Succeeded', 'Terminated'].includes(resource.state)) return palette.complete
  if (resource.ready === false || ['NotReady', 'Waiting', 'Unscheduled'].includes(resource.state))
    return palette.warning
  return resource.ready === true ? palette.ready : palette.complete
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
  const { theme } = useTheme()
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    const lines = text.split('\n')
    canvas.width = 768
    canvas.height = lines.length === 1 ? 96 : lines.length * 54 + 24
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = themes[theme].label
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = theme === 'blueprint' ? '600 27px monospace' : '500 29px system-ui'
    ctx.fillStyle = themes[theme].ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((line, index) =>
      ctx.fillText(line, 384, lines.length === 1 ? 48 : 39 + index * 54, 730),
    )
    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    return result
  }, [text, theme])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite
      position={position}
      scale={[width, (width * texture.image.height) / texture.image.width, 1]}
      onClick={onClick}
    >
      <spriteMaterial map={texture} depthTest={false} transparent toneMapped={false} />
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
  groupMembers,
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
    : groupMembers?.length
      ? groupMembers
      : selected
        ? [...sceneHighlights(layout, selected, [])]
        : matching
  const points = [
    ...focusIds.map((id) => layout.positions.get(id)).filter((p): p is Point => !!p),
    ...layout.resources
      .filter((r) => r.kind === 'Service' && focusIds.includes(r.id))
      .flatMap((r) => servicePatrol(layout, r.id).points),
  ]
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
  }, [selected, focusRevision, motion, camera, invalidate, size.width, size.height])
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
  const theme = props.theme ?? 'midnight'
  const tint = color(resource, props.fresh(resource), theme)
  const services = podServices(props.layout, resource.id)
  const ns = props.layout.resources.find(
    (r) => r.kind === 'Namespace' && r.name === resource.namespace,
  )
  return (
    <>
      <mesh position={[pod.position[0], pod.position[1] / 2, pod.position[2]]}>
        <cylinderGeometry args={[0.013, 0.013, pod.position[1] - 0.1, 6]} />
        <meshStandardMaterial color={theme === 'midnight' ? '#354e65' : themes[theme].frame} />
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
        {services.map((service, index) => (
          <mesh
            key={service.id}
            position={[(index - (services.length - 1) / 2) * 0.24, pod.radius + 0.12, 0]}
            onClick={(event) => {
              event.stopPropagation()
              props.onSelect(service.id)
            }}
          >
            <sphereGeometry args={[0.09, 12, 8]} />
            <meshBasicMaterial
              color={serviceColor(service)}
              transparent
              opacity={props.fresh(service) ? 1 : 0.45}
            />
          </mesh>
        ))}
        <PodShell
          theme={theme}
          radius={pod.radius}
          tint={tint}
          opacity={highlighted.has(resource.id) ? 1 : 0.25}
          onClick={choosePod}
        />
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
            {theme === 'garden' ? (
              <SoftBox
                size={pod.containers.length === 1 ? [0.58, 0.58, 0.58] : [0.37, 0.45, 0.37]}
              />
            ) : theme === 'blueprint' ? (
              <cylinderGeometry
                args={[
                  pod.containers.length === 1 ? 0.32 : 0.21,
                  pod.containers.length === 1 ? 0.32 : 0.21,
                  0.48,
                  6,
                ]}
              />
            ) : (
              <boxGeometry
                args={pod.containers.length === 1 ? [0.58, 0.58, 0.58] : [0.37, 0.45, 0.37]}
              />
            )}
            <meshStandardMaterial
              color={color(c.resource, props.fresh(c.resource), theme)}
              emissive={color(c.resource, props.fresh(c.resource), theme)}
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

function GroupedWorkloads({ props }: { props: Props }) {
  const theme = props.theme ?? 'midnight'
  const palette = themes[theme]
  const mesh = useRef<InstancedMesh>(null)
  const [near, setNear] = useState<string | null>(null)
  const elapsed = useRef(0)
  const phase = useRef(0)
  const transform = useRef(new Object3D())
  const groups = props.layout.groups
  const active = new Set(
    props.groupMembers ?? sceneHighlights(props.layout, props.selected, props.matching),
  )
  const { invalidate } = useThree()
  useEffect(() => {
    if (!mesh.current) return
    const object = new Object3D()
    groups.forEach((entry, index) => {
      object.position.set(...entry.position)
      object.scale.set(0.8, 0.8, 0.8)
      object.updateMatrix()
      mesh.current!.setMatrixAt(index, object.matrix)
      const summary = props.summaries.get(entry.group.id)!
      const tint = new Color(
        summary.warning ? palette.warning : summary.unknown ? palette.unknown : palette.ready,
      )
      if (!entry.group.pods.some((pod) => active.has(pod.id))) tint.multiplyScalar(0.25)
      mesh.current!.setColorAt(index, tint)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
    invalidate()
  }, [groups, props.summaries, invalidate, theme])
  useFrame(({ camera }, delta) => {
    if (mesh.current && props.motion) {
      phase.current += Math.min(delta, 0.1)
      groups.forEach((entry, index) => {
        const summary = props.summaries.get(entry.group.id)!
        const alive = summary.ready === summary.total
        transform.current.position.set(...entry.position)
        if (alive) transform.current.position.y += Math.sin(phase.current + index) * 0.06
        transform.current.rotation.y = alive ? phase.current * 0.12 : 0
        transform.current.scale.set(0.8, 0.8, 0.8)
        transform.current.updateMatrix()
        mesh.current!.setMatrixAt(index, transform.current.matrix)
      })
      mesh.current.instanceMatrix.needsUpdate = true
    }
    elapsed.current += delta
    if (elapsed.current < 0.25) return
    elapsed.current = 0
    let closest: string | null = null,
      distance = 9
    for (const entry of groups) {
      const d = camera.position.distanceTo(new Vector3(...entry.position))
      if (d < distance) {
        distance = d
        closest = entry.group.id
      }
    }
    setNear((previous) => (previous === closest ? previous : closest))
  })
  if (!groups.length) return null
  const close = groups.find((entry) => entry.group.id === near)
  const labels =
    groups.length <= 32 ? groups : groups.filter((entry) => entry.group.id === near).slice(0, 1)
  return (
    <>
      <instancedMesh
        key={`${groups.length}:${theme}`}
        ref={mesh}
        args={[undefined, undefined, groups.length]}
        onClick={(event) => {
          event.stopPropagation()
          const entry = groups[event.instanceId ?? -1]
          if (entry) props.onSelect(entry.group.id)
        }}
      >
        {theme === 'garden' ? (
          <dodecahedronGeometry args={[1, 0]} />
        ) : theme === 'blueprint' ? (
          <octahedronGeometry args={[1, 0]} />
        ) : (
          <icosahedronGeometry args={[1, 0]} />
        )}
        <meshStandardMaterial
          wireframe={theme !== 'garden'}
          roughness={0.6}
          transparent={theme === 'garden'}
          opacity={theme === 'garden' ? 0.6 : 1}
        />
      </instancedMesh>
      {labels.map((entry) => {
        const value = props.summaries.get(entry.group.id)!
        return (
          <Label
            key={entry.group.id}
            text={`${entry.group.name} · ${entry.hidden} hidden / ${value.total} pods · ${value.warning} investigate · ${value.unknown} unknown`}
            position={[entry.position[0], entry.position[1] + 1.3, entry.position[2]]}
            width={3.4}
            onClick={(event) => {
              event.stopPropagation()
              props.onSelect(entry.group.id)
            }}
          />
        )
      })}
      {close && <GroupPreview key={close.group.id} entry={close} props={props} />}
    </>
  )
}

function GroupPreview({ entry, props }: { entry: GroupPlacement; props: Props }) {
  const theme = props.theme ?? 'midnight'
  const pods = entry.group.pods.slice(0, 24)
  const mesh = useRef<InstancedMesh>(null)
  useEffect(() => {
    if (!mesh.current) return
    const object = new Object3D()
    pods.forEach((pod, index) => {
      object.position.set(((index % 6) - 2.5) * 0.3, Math.floor(index / 6) * 0.3, 0)
      object.updateMatrix()
      mesh.current!.setMatrixAt(index, object.matrix)
      mesh.current!.setColorAt(index, new Color(color(pod, props.fresh(pod), theme)))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [entry.group, props.fresh, theme])
  return (
    <group position={[entry.position[0], entry.position[1], entry.position[2] + 1]}>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, pods.length]}
        onClick={(event) => {
          event.stopPropagation()
          const pod = pods[event.instanceId ?? -1]
          if (pod) props.onSelect(pod.id)
        }}
      >
        {theme === 'garden' ? (
          <sphereGeometry args={[0.12, 10, 8]} />
        ) : theme === 'blueprint' ? (
          <cylinderGeometry args={[0.12, 0.12, 0.2, 6]} />
        ) : (
          <icosahedronGeometry args={[0.12, 0]} />
        )}
        <meshStandardMaterial />
      </instancedMesh>
      <Label
        text={`Preview ${pods.length}/${entry.group.pods.length} · click group for all members`}
        position={[0, -0.4, 0]}
        width={3.3}
      />
    </group>
  )
}

function House(props: Props) {
  const { layout } = props
  const ids = sceneHighlights(layout, props.selected, props.matching)
  const byId = new Map(layout.resources.map((r) => [r.id, r]))
  const serviceCount = layout.objects.filter((o) => o.resource.kind === 'Service').length
  const routeKeys = new Set<string>()
  for (const id of props.groupMembers ?? []) ids.add(id)
  if (props.groupMembers?.length)
    for (const pod of layout.pods)
      if (ids.has(pod.resource.id)) for (const child of pod.containers) ids.add(child.resource.id)
  const width = layout.width + 0.7
  const depth = layout.depth + 0.7
  const height = Math.max(3.1, ...layout.pods.map((p) => p.position[1] + p.radius + 0.8))
  const theme = props.theme ?? 'midnight'
  const palette = themes[theme]
  return (
    <group>
      <ClusterStructure theme={theme} width={width} depth={depth} height={height} />
      {layout.rooms.map((room) => (
        <group key={room.resource.id} position={room.position}>
          <mesh
            position={[0, 0.015, 0]}
            onClick={(e) => {
              e.stopPropagation()
              props.onSelect(room.resource.id)
            }}
          >
            {theme === 'garden' ? (
              <SoftBox size={[room.width, 0.08, room.depth]} radius={0.04} />
            ) : (
              <boxGeometry args={[room.width, 0.08, room.depth]} />
            )}
            <meshStandardMaterial
              color={ids.has(room.resource.id) ? palette.activeRoom : palette.room}
              roughness={0.7}
            />
          </mesh>
          <Box
            position={[room.width / 2, 0.65, 0]}
            size={[0.045, 1.3, room.depth]}
            tint={theme === 'midnight' ? '#56809b' : palette.frame}
            opacity={0.22}
          />
          <Box
            position={[0, 0.65, -room.depth / 2]}
            size={[room.width, 1.3, 0.045]}
            tint={theme === 'midnight' ? '#56809b' : palette.frame}
            opacity={0.22}
          />
          <Label
            text={`${room.resource.name} · ${props.nodeSummaries.get(room.resource.name)?.total ?? 0} pods · ${props.nodeSummaries.get(room.resource.name)?.warning ?? 0} investigate · ${props.nodeSummaries.get(room.resource.name)?.unknown ?? 0} unknown`}
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
      <GroupedWorkloads props={props} />
      {layout.objects.map((object) =>
        object.resource.kind === 'Service' &&
        serviceCount > 32 &&
        props.selected !== object.resource.id ? (
          <mesh
            key={object.resource.id}
            position={object.position}
            onClick={(event) => {
              event.stopPropagation()
              props.onSelect(object.resource.id)
            }}
          >
            <capsuleGeometry args={[0.12, 0.25, 4, 6]} />
            <meshStandardMaterial
              color={serviceColor(object.resource)}
              transparent
              opacity={props.fresh(object.resource) ? 1 : 0.4}
            />
          </mesh>
        ) : (
          <Infrastructure
            key={object.resource.id}
            {...object}
            props={props}
            highlighted={ids.has(object.resource.id)}
          />
        ),
      )}
      {layout.edges
        .filter((edge) => {
          const source = byId.get(edge.from)
          const target = byId.get(edge.to)
          const routeKey = `${layout.positions.get(edge.from)?.join(':')}/${layout.positions.get(edge.to)?.join(':')}/${edge.from}`
          if (routeKeys.has(routeKey)) return false
          routeKeys.add(routeKey)
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
            !!props.selected &&
            (edge.from === props.selected ||
              edge.to === props.selected ||
              (props.selected.startsWith('workload:') && (ids.has(edge.from) || ids.has(edge.to))))
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
                layout.resources.find((r) => r.id === edge.from)?.kind === 'Service'
                  ? serviceColor(layout.resources.find((r) => r.id === edge.from)!)
                  : networkKinds.has(layout.resources.find((r) => r.id === edge.from)!.kind)
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
          <meshStandardMaterial color={color(c.resource, props.fresh(c.resource), theme)} />
        </mesh>
      ))}
    </group>
  )
}

export function LiveHabitatScene(props: Props) {
  const themeState = useTheme()
  const palette = themes[themeState.theme]
  const { layout } = props
  const scale = Math.max(layout.width, layout.depth, 12)
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={props.motion ? 'always' : 'demand'}
      camera={{
        position: [scale, scale * 0.85, scale * 1.15],
        fov: 43,
        far: Math.max(200, scale * 10),
      }}
      aria-label={`Live Kubernetes house with ${layout.rooms.length} node rooms, ${layout.totalPods} observed pods and ${layout.totalContainers} containers; ${layout.groups.length} collapsed workload groups and ${layout.pods.length} individual pods shown`}
    >
      <ThemeContext.Provider value={themeState}>
        <color attach="background" args={[palette.background]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 12, 8]} intensity={2.5} />
        <pointLight
          position={[-5, 5, 2]}
          color={themeState.theme === 'garden' ? '#fff1c8' : '#6adde0'}
          intensity={themeState.theme === 'midnight' ? 22 : 9}
        />
        <House {...props} theme={themeState.theme} />
        <gridHelper
          args={[scale * 4, Math.min(120, Math.ceil(scale * 4)), palette.grid, palette.gridMinor]}
          position={[0, -0.3, 0]}
        />
        <CameraRig {...props} />
      </ThemeContext.Provider>
    </Canvas>
  )
}
