import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ClaseRef, InfoCampana, TipoEntidad } from '@/api/hooks'
import type { Schemas } from '@/api/client'

type EstiloTipo = Schemas['EstiloTipo']

const SIN_ESTILO: EstiloTipo = { color: null, forma: null, icono: null }

export interface CampaignContextValue {
  cid: string
  info: InfoCampana
  /** Tipo principal por clave compacta. */
  tipoPorClave: Map<string, TipoEntidad>
  /** Estilo (color, forma, icono) de una clase por clave compacta. */
  estilo: (clave: string | null | undefined) => EstiloTipo
  /** Ruta de la campaña. */
  path: (sub?: string) => string
  entityPath: (id: string) => string
}

const CampaignContext = createContext<CampaignContextValue | null>(null)

export function CampaignProvider({ cid, info, children }: { cid: string; info: InfoCampana; children: ReactNode }) {
  const value = useMemo<CampaignContextValue>(() => {
    const tipoPorClave = new Map(info.tipos.map((t) => [t.clase.clave, t]))
    const base = `/c/${encodeURIComponent(cid)}`
    return {
      cid,
      info,
      tipoPorClave,
      estilo: (clave) => (clave ? tipoPorClave.get(clave)?.estilo : undefined) ?? SIN_ESTILO,
      path: (sub) => (sub ? `${base}/${sub}` : base),
      entityPath: (id) => `${base}/e/${encodeURIComponent(id)}`,
    }
  }, [cid, info])
  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext)
  if (!ctx) throw new Error('useCampaign debe usarse dentro de una campaña')
  return ctx
}

/** Versión opcional (para componentes que también se usan fuera de una campaña). */
export function useOptionalCampaign(): CampaignContextValue | null {
  return useContext(CampaignContext)
}

export type { ClaseRef }
