/* oxlint-disable react/only-export-components -- módulo de utilidades de test, no participa en fast refresh */
/**
 * Utilidades de render para los tests de componentes.
 *
 * ```tsx
 * const { user, router } = renderWithProviders(<ProposalsPage />, {
 *   route: '/c/noches-de-madrid/propuestas/7117244baf',
 *   path: ['/c/:cid/propuestas', '/c/:cid/propuestas/:pid'],
 *   campaign: true,
 * })
 * await user.click(await screen.findByRole('button', { name: 'Aprobar' }))
 * expect(router.state.location.pathname).toBe('/c/noches-de-madrid/propuestas')
 * ```
 *
 * Envuelve con: QueryClientProvider (sin reintentos), ThemeProvider,
 * TooltipProvider, un router en memoria y, opcionalmente, CampaignProvider
 * (con `infoCampana` de los fixtures u otro `InfoCampana`) y el Toaster de sonner.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from 'react-router'
import { Toaster } from 'sonner'
import type { InfoCampana } from '@/api/hooks'
import { CampaignProvider } from '@/app/campaign-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { CID, infoCampana } from './fixtures'

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper' | 'queries'> {
  /** URL inicial del router en memoria (por defecto, `path` si es una cadena, o `/`). */
  route?: string
  /** Patrón o patrones de ruta en los que se monta `ui` (p. ej. `/c/:cid/propuestas/:pid`). Por defecto `/`. */
  path?: string | string[]
  /**
   * Monta `CampaignProvider`: `true` usa el fixture `infoCampana`; también se
   * puede pasar otro `InfoCampana`. Por defecto no hay campaña.
   */
  campaign?: boolean | InfoCampana
  /** Id de la campaña para el provider (por defecto, el de `info.campana.id`). */
  cid?: string
  /** QueryClient propio (por defecto uno nuevo sin reintentos). */
  queryClient?: QueryClient
  /** Rutas adicionales (p. ej. destinos de enlaces). Siempre hay un `*` que muestra la ruta actual. */
  extraRoutes?: RouteObject[]
  /** Monta el `<Toaster />` de sonner para poder comprobar avisos. Por defecto `true`. */
  withToaster?: boolean
}

export interface RenderWithProvidersResult extends RenderResult {
  router: ReturnType<typeof createMemoryRouter>
  queryClient: QueryClient
  user: ReturnType<typeof userEvent.setup>
}

/** QueryClient para tests: sin reintentos ni caché entre tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

/** Muestra la ruta actual en rutas no declaradas (útil para comprobar navegaciones). */
export function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): RenderWithProvidersResult {
  const {
    route,
    path = '/',
    campaign = false,
    cid,
    queryClient = createTestQueryClient(),
    extraRoutes = [],
    withToaster = true,
    ...renderOptions
  } = options

  const info = campaign === true ? infoCampana : campaign || null
  const element: ReactNode = info ? (
    <CampaignProvider cid={cid ?? info.campana.id ?? CID} info={info}>
      {ui}
    </CampaignProvider>
  ) : (
    ui
  )
  const paths = Array.isArray(path) ? path : [path]
  const routes: RouteObject[] = [
    ...paths.map((p) => ({ path: p, element })),
    ...extraRoutes,
    { path: '*', element: <LocationDisplay /> },
  ]
  const initial = route ?? (typeof path === 'string' && !path.includes(':') ? path : '/')
  const router = createMemoryRouter(routes, { initialEntries: [initial] })

  const user = userEvent.setup()
  const result = render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
          {withToaster && <Toaster />}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
    renderOptions,
  )
  return { ...result, router, queryClient, user }
}

export * from '@testing-library/react'
