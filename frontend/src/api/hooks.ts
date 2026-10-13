/**
 * Hooks de TanStack Query sobre el cliente tipado. Todas las pantallas acceden
 * a la API a través de aquí, de modo que la caché y las invalidaciones viven
 * en un solo sitio.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API_BASE, api, postForm, unwrap, type Schemas } from './client'

export type CampanaResumen = Schemas['CampanaResumen']
export type InfoCampana = Schemas['InfoCampana']
export type PanelCampana = Schemas['PanelCampana']
export type Entidad = Schemas['Entidad']
export type EntidadRef = Schemas['EntidadRef']
export type EntidadEntrada = Schemas['EntidadEntrada']
export type Formulario = Schemas['Formulario']
export type Campo = Schemas['Campo']
export type Valor = Schemas['Valor']
export type Grafo = Schemas['Grafo']
export type NodoGrafo = Schemas['NodoGrafo']
export type AristaGrafo = Schemas['AristaGrafo']
export type ResultadoSparql = Schemas['ResultadoSparql']
export type ConsultaSparql = Schemas['ConsultaSparql']
export type Termino = Schemas['Termino']
export type TripletaLegible = Schemas['TripletaLegible']
/** Tripleta editable: el esquema distingue entrada (opcionales) y salida (completa). */
export type TripletaEntrada = Schemas['TripletaEntrada-Input']
export type TripletaEntradaSalida = Schemas['TripletaEntrada-Output']
export type PropuestaResumen = Schemas['PropuestaResumen']
export type PropuestaDetalle = Schemas['PropuestaDetalle']
export type MundoReal = Schemas['MundoReal']
export type SesionLinea = Schemas['SesionLinea']
export type CambioInfo = Schemas['CambioInfo']
export type TipoEntidad = Schemas['TipoEntidad']
export type ClaseRef = Schemas['ClaseRef']
export type ModuloInfo = Schemas['ModuloInfo']
export type TemaActivo = Schemas['TemaActivo']

/** El idioma forma parte de las claves: las etiquetas cambian con él. */
function useLang(): string {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'es'
}

export const keys = {
  campanas: (lang: string) => ['campanas', lang] as const,
  campana: (cid: string, lang: string) => ['campana', cid, lang] as const,
  all: (cid: string) => ['c', cid] as const,
  panel: (cid: string, lang: string) => ['c', cid, 'panel', lang] as const,
  entidades: (cid: string, params: object, lang: string) => ['c', cid, 'entidades', params, lang] as const,
  entidad: (cid: string, eid: string, lang: string) => ['c', cid, 'entidad', eid, lang] as const,
  formulario: (cid: string, clases: string[], lang: string) => ['c', cid, 'form', clases, lang] as const,
  grafo: (cid: string, params: object, lang: string) => ['c', cid, 'grafo', params, lang] as const,
  propuestas: (cid: string, estado: string | undefined, lang: string) => ['c', cid, 'propuestas', estado, lang] as const,
  propuesta: (cid: string, pid: string, lang: string) => ['c', cid, 'propuesta', pid, lang] as const,
}

// ------------------------------------------------------------------ módulos
export function useModulos() {
  const lang = useLang()
  return useQuery({
    queryKey: ['modulos', lang],
    queryFn: () => unwrap(api.GET('/modulos')),
    staleTime: 5 * 60_000,
  })
}

// ----------------------------------------------------------------- campañas
export function useCampanas() {
  const lang = useLang()
  return useQuery({ queryKey: keys.campanas(lang), queryFn: () => unwrap(api.GET('/campanas')) })
}

export function useCampana(cid: string | undefined) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.campana(cid ?? '', lang),
    queryFn: () => unwrap(api.GET('/campanas/{cid}', { params: { path: { cid: cid! } } })),
    enabled: !!cid,
    staleTime: 30_000,
  })
}

export function useCrearCampana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['CampanaEntrada']) => unwrap(api.POST('/campanas', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campanas'] }),
  })
}

export function useBorrarCampana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cid: string) => unwrap(api.DELETE('/campanas/{cid}', { params: { path: { cid } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campanas'] }),
  })
}

export function usePanel(cid: string) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.panel(cid, lang),
    queryFn: () => unwrap(api.GET('/campanas/{cid}/panel', { params: { path: { cid } } })),
  })
}

export function useSesiones(cid: string) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'sesiones', lang],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/sesiones', { params: { path: { cid } } })),
  })
}

// ---------------------------------------------------------------- entidades
export interface FiltrosEntidades {
  clase?: string
  q?: string
  orden?: 'nombre' | 'reciente' | 'relevancia'
  limite?: number
  desplazamiento?: number
  filtro?: string[]
}

export function useEntidades(cid: string, params: FiltrosEntidades, enabled = true) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.entidades(cid, params, lang),
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/entidades', { params: { path: { cid }, query: params } })),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useEntidad(cid: string, eid: string | undefined) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.entidad(cid, eid ?? '', lang),
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/entidades/{eid}', { params: { path: { cid, eid: eid! } } })),
    enabled: !!eid,
  })
}

export function useFormulario(cid: string, clases: string[]) {
  const lang = useLang()
  const [clase, ...variantes] = clases
  return useQuery({
    queryKey: keys.formulario(cid, clases, lang),
    queryFn: () =>
      unwrap(
        api.GET('/campanas/{cid}/formularios/{clase}', {
          params: { path: { cid, clase: clase! }, query: { variante: variantes } },
        }),
      ),
    enabled: !!clase,
    staleTime: 5 * 60_000,
  })
}

/** Tras escribir, todo lo de la campaña puede haber cambiado (reglas derivadas, grafo…). */
function useInvalidateCampaign(cid: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.all(cid) })
}

export function useGuardarEntidad(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eid, body }: { eid?: string; body: EntidadEntrada }) =>
      eid
        ? unwrap(api.PUT('/campanas/{cid}/entidades/{eid}', { params: { path: { cid, eid } }, body }))
        : unwrap(api.POST('/campanas/{cid}/entidades', { params: { path: { cid } }, body })),
    onSuccess: () => {
      void invalidate()
      void qc.invalidateQueries({ queryKey: ['campana', cid] })
    },
  })
}

export function useBorrarEntidad(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (eid: string) =>
      unwrap(api.DELETE('/campanas/{cid}/entidades/{eid}', { params: { path: { cid, eid } } })),
    onSuccess: () => void invalidate(),
  })
}

export function useProcedencia(cid: string, eid: string, enabled = true) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'procedencia', eid, lang],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/entidades/{eid}/procedencia', { params: { path: { cid, eid } } })),
    enabled,
  })
}

export function useMundoReal(cid: string, eid: string, enabled = true) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'mundo-real', eid, lang],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/entidades/{eid}/mundo-real', { params: { path: { cid, eid } } })),
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
  })
}

export function useVecindario(cid: string, eid: string, profundidad = 1) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'vecindario', eid, profundidad, lang],
    queryFn: () =>
      unwrap(
        api.GET('/campanas/{cid}/entidades/{eid}/vecindario', {
          params: { path: { cid, eid }, query: { profundidad } },
        }),
      ),
  })
}

// --------------------------------------------------------------------- grafo
export interface FiltrosGrafo {
  tipo?: string[]
  faccion?: string
  centro?: string
  profundidad?: number
  relacion?: string[]
  vista?: string
  sesion?: number
  sesiones?: boolean
}

export function useGrafo(cid: string, params: FiltrosGrafo) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.grafo(cid, params, lang),
    queryFn: () => unwrap(api.GET('/campanas/{cid}/grafo', { params: { path: { cid }, query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function usePersonajesConConocimiento(cid: string) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'conocimiento', lang],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/conocimiento', { params: { path: { cid } } })),
  })
}

export function useConocimiento(cid: string, eid: string | undefined) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'conocimiento', eid, lang],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/conocimiento/{eid}', { params: { path: { cid, eid: eid! } } })),
    enabled: !!eid,
    retry: false,
  })
}

// -------------------------------------------------------------------- SPARQL
export function useSparql(cid: string) {
  const lang = useLang()
  return useMutation({
    mutationKey: ['sparql', cid, lang],
    mutationFn: (body: ConsultaSparql) =>
      unwrap(api.POST('/campanas/{cid}/sparql', { params: { path: { cid } }, body })),
  })
}

export function useEjemplosSparql(cid: string) {
  return useQuery({
    queryKey: ['c', cid, 'sparql-ejemplos'],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/sparql/ejemplos', { params: { path: { cid } } })),
  })
}

export function useGuardarConsulta(cid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['ConsultaGuardadaEntrada']) =>
      unwrap(api.POST('/campanas/{cid}/sparql/guardadas', { params: { path: { cid } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['c', cid, 'sparql-ejemplos'] }),
  })
}

export function useBorrarConsulta(cid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (qid: string) =>
      unwrap(api.DELETE('/campanas/{cid}/sparql/guardadas/{qid}', { params: { path: { cid, qid } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['c', cid, 'sparql-ejemplos'] }),
  })
}

// ---------------------------------------------------------------- propuestas
export function usePropuestas(cid: string, estado?: 'pendiente' | 'aprobada' | 'rechazada') {
  const lang = useLang()
  return useQuery({
    queryKey: keys.propuestas(cid, estado, lang),
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/propuestas', { params: { path: { cid }, query: { estado } } })),
  })
}

export function usePropuesta(cid: string, pid: string | undefined) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.propuesta(cid, pid ?? '', lang),
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/propuestas/{pid}', { params: { path: { cid, pid: pid! } } })),
    enabled: !!pid,
  })
}

export function usePropuestaEditable(cid: string, pid: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['c', cid, 'propuesta-editable', pid],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/propuestas/{pid}/editable', { params: { path: { cid, pid: pid! } } })),
    enabled: enabled && !!pid,
  })
}

export function useRevisarPropuesta(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: ({
      pid,
      accion,
      body,
    }: {
      pid: string
      accion: 'aprobar' | 'rechazar'
      body: Schemas['RevisionEntrada']
    }) =>
      accion === 'aprobar'
        ? unwrap(api.POST('/campanas/{cid}/propuestas/{pid}/aprobar', { params: { path: { cid, pid } }, body }))
        : unwrap(api.POST('/campanas/{cid}/propuestas/{pid}/rechazar', { params: { path: { cid, pid } }, body })),
    onSuccess: () => void invalidate(),
  })
}

export function useAprobarLote(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (body: Schemas['LoteEntrada']) =>
      unwrap(api.POST('/campanas/{cid}/propuestas/aprobar-lote', { params: { path: { cid } }, body })),
    onSuccess: () => void invalidate(),
  })
}

// ------------------------------------------------------------------- agente
export function useEstadoAgente(cid: string) {
  return useQuery({
    queryKey: ['c', cid, 'agente'],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/agente', { params: { path: { cid } } })),
    staleTime: 5 * 60_000,
  })
}

/** Contexto del sistema de juego que reciben los modelos (lore, estadísticas, reglas…). */
export function useContextoLLM(cid: string, maxCaracteres?: number, enabled = true) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'contexto-llm', maxCaracteres, lang],
    queryFn: () =>
      unwrap(
        api.GET('/campanas/{cid}/contexto-llm', {
          params: { path: { cid }, query: { max_caracteres: maxCaracteres } },
        }),
      ),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function usePedirAgente(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (peticion: string) =>
      unwrap(api.POST('/campanas/{cid}/agente', { params: { path: { cid } }, body: { peticion } })),
    onSuccess: () => void invalidate(),
  })
}

// ------------------------------------------------------------------- ajustes
export type Ajustes = Schemas['Ajustes']
export type AjustesEntrada = Schemas['AjustesEntrada']

export function useAjustes() {
  return useQuery({ queryKey: ['ajustes'], queryFn: () => unwrap(api.GET('/ajustes')) })
}

export function useGuardarAjustes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AjustesEntrada) => unwrap(api.PUT('/ajustes', { body })),
    onSuccess: (data) => {
      qc.setQueryData(['ajustes'], data)
      // El modelo y su contexto dependen de los ajustes.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('agente') || q.queryKey.includes('contexto-llm') })
    },
  })
}

export function useProbarLLM() {
  return useMutation({ mutationFn: () => unwrap(api.POST('/ajustes/llm/probar')) })
}

// ------------------------------------------------------------------ búsqueda
export function useBusqueda(q: string, campana?: string) {
  const lang = useLang()
  return useQuery({
    queryKey: ['busqueda', q, campana, lang],
    queryFn: () => unwrap(api.GET('/busqueda', { params: { query: { q, campana, limite: 12 } } })),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

// ------------------------------------------------------- ajustes de campaña
export type AjustesCampana = Schemas['AjustesCampana-Output']
export type AjustesCampanaEntrada = Schemas['AjustesCampana-Input']

export function useAjustesCampana(cid: string) {
  return useQuery({
    queryKey: ['c', cid, 'ajustes'],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/ajustes', { params: { path: { cid } } })),
  })
}

export function useGuardarAjustesCampana(cid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AjustesCampanaEntrada) =>
      unwrap(api.PUT('/campanas/{cid}/ajustes', { params: { path: { cid } }, body })),
    onSuccess: (data) => {
      // El lore y el modelo propio cambian el contexto del asistente; la sesión actual, la historia.
      void qc.invalidateQueries({ queryKey: keys.all(cid) })
      qc.setQueryData(['c', cid, 'ajustes'], data)
    },
  })
}

export function useEditarCampana(cid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['CampanaEntrada']) =>
      unwrap(api.PUT('/campanas/{cid}', { params: { path: { cid } }, body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campanas'] })
      void qc.invalidateQueries({ queryKey: ['campana', cid] })
      void qc.invalidateQueries({ queryKey: keys.all(cid) })
    },
  })
}

// --------------------------------------------------- exportar / importar
export type ResultadoImportacion = Schemas['ResultadoImportacion']

/** URL de descarga directa del ZIP de la campaña. */
export function exportarCampanaUrl(cid: string): string {
  return `${API_BASE}/campanas/${encodeURIComponent(cid)}/exportar`
}

export function useImportarCampana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ archivo, id, nombre }: { archivo: File; id?: string; nombre?: string }) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      if (id) fd.append('id', id)
      if (nombre) fd.append('nombre', nombre)
      return postForm<ResultadoImportacion>('/campanas/importar', fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campanas'] }),
  })
}

// ------------------------------------------------------------ historial
export function useCambios(cid: string, limite = 50, desplazamiento = 0) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'cambios', limite, desplazamiento, lang],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/cambios', { params: { path: { cid }, query: { limite, desplazamiento } } })),
    placeholderData: keepPreviousData,
  })
}

export function useDeshacer(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (chid: string) =>
      unwrap(api.POST('/campanas/{cid}/cambios/{chid}/deshacer', { params: { path: { cid, chid } } })),
    onSuccess: () => void invalidate(),
  })
}

export type HechoTemporal = Schemas['HechoTemporal']

export function useHistoriaTemporal(cid: string, eid: string, enabled = true) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'historia-temporal', eid, lang],
    queryFn: () =>
      unwrap(api.GET('/campanas/{cid}/entidades/{eid}/historia-temporal', { params: { path: { cid, eid } } })),
    enabled,
  })
}

// --------------------------------------------------------- incoherencias
export type Incoherencia = Schemas['Incoherencia']
export type InformeCoherencia = Schemas['InformeCoherencia']

export function useIncoherencias(cid: string, opts: { incluirIgnoradas?: boolean; entidad?: string } = {}) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'incoherencias', opts, lang],
    queryFn: () =>
      unwrap(
        api.GET('/campanas/{cid}/incoherencias', {
          params: { path: { cid }, query: { incluir_ignoradas: opts.incluirIgnoradas, entidad: opts.entidad } },
        }),
      ),
  })
}

export function useMarcarIncoherencia(cid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ iid, ignorada }: { iid: string; ignorada: boolean }) =>
      unwrap(api.PUT('/campanas/{cid}/incoherencias/{iid}', { params: { path: { cid, iid } }, body: { ignorada } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['c', cid, 'incoherencias'] })
      void qc.invalidateQueries({ queryKey: ['c', cid, 'panel'] })
    },
  })
}

// --------------------------------------------------------------- imágenes
export type Imagen = Schemas['Imagen']
export type Mapa = Schemas['Mapa']
export type Marcador = Schemas['Marcador']
export type MarcadorEntrada = Schemas['MarcadorEntrada']

export function useSubirRetrato(cid: string, eid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (archivo: File) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      return postForm<Imagen>(`/campanas/${encodeURIComponent(cid)}/entidades/${encodeURIComponent(eid)}/retratos`, fd)
    },
    onSuccess: () => void invalidate(),
  })
}

/** Quita un retrato; `nodo` puede ser la URL de la imagen tal como aparece en la ficha. */
export function useQuitarRetrato(cid: string, eid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (nodo: string) =>
      unwrap(api.DELETE('/campanas/{cid}/entidades/{eid}/retratos', { params: { path: { cid, eid }, query: { nodo } } })),
    onSuccess: () => void invalidate(),
  })
}

export function useMapas(cid: string) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'mapas', lang],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/mapas', { params: { path: { cid } } })),
  })
}

export function useMapa(cid: string, eid: string | undefined) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'mapa', eid, lang],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/mapas/{eid}', { params: { path: { cid, eid: eid! } } })),
    enabled: !!eid,
  })
}

export function useMapasDeEntidad(cid: string, eid: string) {
  const lang = useLang()
  return useQuery({
    queryKey: ['c', cid, 'mapas-de', eid, lang],
    queryFn: () => unwrap(api.GET('/campanas/{cid}/entidades/{eid}/mapas', { params: { path: { cid, eid } } })),
  })
}

export function useCrearMapa(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: ({ archivo, nombre, descripcion }: { archivo: File; nombre: string; descripcion?: string }) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('nombre', nombre)
      if (descripcion) fd.append('descripcion', descripcion)
      return postForm<Mapa>(`/campanas/${encodeURIComponent(cid)}/mapas`, fd)
    },
    onSuccess: () => void invalidate(),
  })
}

export function useGuardarMarcadores(cid: string, eid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (body: MarcadorEntrada[]) =>
      unwrap(api.PUT('/campanas/{cid}/mapas/{eid}/marcadores', { params: { path: { cid, eid } }, body })),
    onSuccess: () => void invalidate(),
  })
}

// -------------------------------------------------------------- generador
export type GeneracionEntrada = Schemas['GeneracionEntrada']
export type ResultadoGeneracion = Schemas['ResultadoGeneracion']

export function useGenerar(cid: string) {
  const invalidate = useInvalidateCampaign(cid)
  return useMutation({
    mutationFn: (body: GeneracionEntrada) =>
      unwrap(api.POST('/campanas/{cid}/generar', { params: { path: { cid } }, body })),
    onSuccess: () => void invalidate(),
  })
}
