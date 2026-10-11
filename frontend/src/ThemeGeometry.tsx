import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { themes, isModernTheme } from './themes'
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
  if (isModernTheme(theme)) {
    const capsule = theme === 'pearl'
    const orbit = theme === 'aurora'
    return (
      <group>
        <mesh onClick={onClick}>
          {capsule ? (
            <capsuleGeometry args={[radius * 0.72, radius * 0.5, 6, 24]} />
          ) : orbit ? (
            <sphereGeometry args={[radius * 0.94, 24, 16]} />
          ) : (
            <SoftBox size={[radius * 1.5, radius * 1.75, radius * 1.5]} radius={radius * 0.18} />
          )}
          <meshStandardMaterial
            color={tint}
            transparent
            opacity={opacity * 0.1}
            roughness={0.22}
            metalness={0.12}
            depthWrite={false}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            onClick={onClick}
            position={[0, side * radius * (orbit ? 0.18 : 0.68), 0]}
            rotation={orbit ? [Math.PI / 2 + side * 0.3, side * 0.25, 0] : [Math.PI / 2, 0, 0]}
          >
            {theme === 'slate' ? (
              <SoftBox size={[radius * 1.5, radius * 1.5, radius * 0.045]} radius={radius * 0.16} />
            ) : (
              <torusGeometry args={[radius * (orbit ? 0.96 : 0.64), radius * 0.023, 6, 40]} />
            )}
            <meshStandardMaterial
              color={tint}
              transparent
              opacity={opacity * (theme === 'slate' ? 0.3 : 0.85)}
              emissive={tint}
              emissiveIntensity={orbit ? 0.28 : 0.06}
              roughness={0.4}
            />
          </mesh>
        ))}
        {theme === 'slate' &&
          [-1, 1].map((side) => (
            <mesh
              key={`edge:${side}`}
              position={[side * radius * 0.7, 0, -radius * 0.7]}
              onClick={onClick}
            >
              <SoftBox size={[radius * 0.035, radius * 1.3, radius * 0.035]} radius={0.01} />
              <meshStandardMaterial color={tint} transparent opacity={opacity} />
            </mesh>
          ))}
      </group>
    )
  }
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

/** The same selectable container footprint, with theme-specific edge treatment. */
export function ContainerShape({ theme, size }: { theme: ThemeId; size: Point }) {
  return theme === 'blueprint' ? (
    <cylinderGeometry args={[size[0] * 0.55, size[0] * 0.55, size[1], 6]} />
  ) : theme === 'garden' || isModernTheme(theme) ? (
    <SoftBox
      size={size}
      radius={
        theme === 'pearl' ? 0.12 : theme === 'aurora' ? 0.14 : theme === 'slate' ? 0.045 : 0.08
      }
    />
  ) : (
    <boxGeometry args={size} />
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
  if (isModernTheme(theme))
    return (
      <group>
        <mesh position={[0, -0.13, 0]}>
          <SoftBox size={[width + 0.4, 0.3, depth + 0.4]} radius={0.14} />
          <meshStandardMaterial color={palette.floor} roughness={0.7} />
        </mesh>
        {[-width / 2, width / 2].flatMap((x) =>
          [-depth / 2, depth / 2].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, height / 2, z]}>
              <SoftBox size={[0.065, height, 0.065]} radius={0.025} />
              <meshStandardMaterial color={palette.frame} roughness={0.45} />
            </mesh>
          )),
        )}
        {[-depth / 2, depth / 2].map((z) => (
          <mesh key={z} position={[0, height, z]}>
            <SoftBox size={[width, 0.075, 0.075]} radius={0.035} />
            <meshStandardMaterial
              color={palette.frame}
              emissive={palette.frame}
              emissiveIntensity={theme === 'aurora' ? 0.2 : 0}
            />
          </mesh>
        ))}
        {[-width / 2, width / 2].map((x) => (
          <mesh key={x} position={[x, height, 0]}>
            <SoftBox size={[0.075, 0.075, depth]} radius={0.035} />
            <meshStandardMaterial color={palette.frame} />
          </mesh>
        ))}
        {theme === 'pearl' && (
          <mesh position={[0, height + 0.025, 0]}>
            <SoftBox size={[width * 0.95, 0.03, depth * 0.95]} radius={0.01} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.045} depthWrite={false} />
          </mesh>
        )}
        {theme === 'aurora' &&
          [-depth / 2, depth / 2].map((z) => (
            <mesh key={`arch:${z}`} position={[0, height, z]} scale={[1, 0.14, 1]}>
              <torusGeometry args={[width / 2, 0.06, 6, 40, Math.PI]} />
              <meshStandardMaterial
                color={palette.frame}
                emissive={palette.frame}
                emissiveIntensity={0.25}
              />
            </mesh>
          ))}
      </group>
    )
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
