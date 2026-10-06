import { useMemo, useSyncExternalStore } from 'react'
import { store } from '@/data/api'
import { useApp } from '@/context/AppContext'

// Vuelve a calcular cuando cambian los datos (gestión, visitas, recuperaciones)
// o la sucursal elegida en el encabezado.
export function useData(selector, deps = []) {
  const version = useSyncExternalStore(store.subscribe, store.getVersion)
  const { branchId } = useApp()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => selector(branchId), [version, branchId, ...deps])
}
