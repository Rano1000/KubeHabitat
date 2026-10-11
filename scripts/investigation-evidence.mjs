// A recovery run cannot manufacture a passing earlier log read from missing logs.
export function previousFailureVerified(logs, podUid, recovering, prior) {
  if (logs.podUid !== podUid) return false
  if (logs.state === 'available')
    return logs.text?.includes('Deliberate acceptance failure: exit 42') === true
  return (
    recovering &&
    logs.state === 'unavailable' &&
    !logs.text &&
    prior?.mode === 'faults' &&
    prior.podUid === podUid &&
    Array.isArray(prior.assertions) &&
    prior.assertions.length === 10 &&
    prior.assertions.every((a) => a.passed === true) &&
    prior.assertions.some((a) => a.name === 'previous failed run logs available')
  )
}
