import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { themes } from './themes'
import type { ThemeId } from './themes'
import type { Point } from './habitatLayout'

export function SoftBox({ size, radius = 0.08 }: { size: Point; radius?: number }) {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((n) => n / 2))),
    [size.join(':'), radius],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return <primitive attach="geometry" object={geometry} />
}

export function PodShell({
  theme,
  radius,
  tint,
  opacity = 1,
  onClick,
}: {
  theme: ThemeId
  radius: number
  tint: string
  opacity?: number
  onClick: (event: ThreeEvent<MouseEvent>) => void
}) {
  if (theme === 'midnight')
    return (
      <mesh onClick={onClick}>
        <icosahedronGeometry args={[radius, 1]} />
        <meshStandardMaterial
          color={tint}
          wireframe
          transparent
          opacity={opacity}
          emissive={tint}
          emissiveIntensity={opacity === 1 ? 0.2 : 0}
        />
      </mesh>
    )
  return (
    <group>
      <mesh onClick={onClick}>
        {theme === 'garden' ? (
          <sphereGeometry args={[radius, 24, 16]} />
        ) : (
          <cylinderGeometry args={[radius, radius, radius * 1.8, 6]} />
        )}
        <meshStandardMaterial
          color={tint}
          transparent
          opacity={opacity * 0.15}
          roughness={0.25}
          depthWrite={false}
        />
      </mesh>
      {theme === 'blueprint' && (
        <mesh onClick={onClick}>
          <cylinderGeometry args={[radius, radius, radius * 1.8, 6]} />
          <meshBasicMaterial color={tint} wireframe transparent opacity={opacity * 0.7} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, side * radius * (theme === 'garden' ? 0.68 : 0.9), 0]}
          rotation={[Math.PI / 2, 0, 0]}
          onClick={onClick}
        >
          <torusGeometry
            args={[
              radius * (theme === 'garden' ? 0.74 : 1),
              radius * 0.035,
              6,
              theme === 'garden' ? 32 : 6,
            ]}
          />
          <meshStandardMaterial color={tint} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  )
}

export function ClusterStructure({
  theme,
  width,
  depth,
  height,
}: {
  theme: ThemeId
  width: number
  depth: number
  height: number
}) {
  const palette = themes[theme]
  const roofRise = Math.min(2, width * 0.16)
  const roofLength = Math.hypot(width / 2, roofRise)
  const beam = (position: Point, size: Point, tint = palette.frame, opacity = 1) => (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={tint}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={theme === 'garden' ? 0.85 : 0.55}
      />
    </mesh>
  )
  return (
    <group>
      <mesh position={[0, -0.13, 0]}>
        {theme === 'garden' ? (
          <SoftBox size={[width + 0.4, 0.3, depth + 0.4]} radius={0.14} />
        ) : (
          <boxGeometry args={[width + 0.4, 0.3, depth + 0.4]} />
        )}
        <meshStandardMaterial color={palette.floor} roughness={0.85} />
      </mesh>
      {beam(
        [0, height / 2, -depth / 2],
        [width, height, 0.06],
        palette.frame,
        theme === 'garden' ? 0.08 : 0.12,
      )}
      {[-width / 2, width / 2].flatMap((x) =>
        [-depth / 2, depth / 2].map((z) => (
          <group key={`${x}:${z}`}>
            {theme === 'garden' ? (
              <mesh position={[x, height / 2, z]}>
                <cylinderGeometry args={[0.065, 0.065, height, 10]} />
                <meshStandardMaterial color={palette.frame} />
              </mesh>
            ) : (
              beam([x, height / 2, z], [0.08, height, 0.08])
            )}
          </group>
        )),
      )}
      {theme === 'garden' ? (
        <>
          {[-depth / 2, 0, depth / 2].map((z) => (
            <mesh key={z} position={[0, height, z]} scale={[1, roofRise / (width / 2), 1]}>
              <torusGeometry args={[width / 2, 0.065, 6, 32, Math.PI]} />
              <meshStandardMaterial color={palette.frame} />
            </mesh>
          ))}
          {beam([0, height + roofRise, 0], [0.065, 0.065, depth])}
        </>
      ) : theme === 'blueprint' ? (
        <>
          {[-depth / 2, depth / 2].map((z) => (
            <group key={z}>{beam([0, height, z], [width, 0.06, 0.06])}</group>
          ))}
          {[-width / 2, width / 2].map((x) => (
            <group key={x}>{beam([x, height, 0], [0.06, 0.06, depth])}</group>
          ))}
          {[-width / 2, width / 2].flatMap((x) =>
            [-depth / 2, depth / 2].map((z) => (
              <mesh key={`cap:${x}:${z}`} position={[x, height, z]}>
                <octahedronGeometry args={[0.14]} />
                <meshStandardMaterial color={palette.frame} />
              </mesh>
            )),
          )}
        </>
      ) : (
        <>
          {[-depth / 2, depth / 2].map((z) => (
            <group key={z}>
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  position={[(side * width) / 4, height + roofRise / 2, z]}
                  rotation={[0, 0, -side * Math.atan2(roofRise, width / 2)]}
                >
                  <boxGeometry args={[roofLength, 0.07, 0.07]} />
                  <meshStandardMaterial color={palette.frame} />
                </mesh>
              ))}
            </group>
          ))}
          {beam([0, height + roofRise, 0], [0.07, 0.07, depth])}
        </>
      )}
    </group>
  )
}
