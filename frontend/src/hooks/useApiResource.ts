import { useEffect, useState } from 'react'
import { requestApi, requestError } from '../lib/requestFlow'

export function useApiResource<T>(path: string) {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await requestApi<T>(path, { signal: controller.signal })
        if (!controller.signal.aborted) setData(result)
      } catch (reason) {
        if (!controller.signal.aborted) setError(requestError(reason))
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [path, revision])
  return { data, setData, loading, error, reload: () => setRevision(value => value + 1) }
}
