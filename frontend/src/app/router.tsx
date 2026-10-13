import { createBrowserRouter } from 'react-router'
import { CampaignLayout } from '@/app/CampaignLayout'
import { NotFound } from '@/app/NotFound'
import { RootLayout } from '@/app/RootLayout'
import { CampaignsPage } from '@/features/campaigns/CampaignsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EntityFormPage } from '@/features/entity/EntityFormPage'
import { EntityPage } from '@/features/entity/EntityPage'
import { ExplorerPage } from '@/features/explorer/ExplorerPage'

// Pantallas pesadas (Cytoscape, CodeMirror…): se cargan al visitarlas.
const lazyPage = (load: () => Promise<{ Component: React.ComponentType }>) => ({ lazy: load })
const graph = lazyPage(() => import('@/features/graph/GraphPage').then((m) => ({ Component: m.GraphPage })))
const sparql = lazyPage(() => import('@/features/sparql/SparqlPage').then((m) => ({ Component: m.SparqlPage })))
const sessions = lazyPage(() => import('@/features/sessions/SessionsPage').then((m) => ({ Component: m.SessionsPage })))
const proposals = lazyPage(() => import('@/features/proposals/ProposalsPage').then((m) => ({ Component: m.ProposalsPage })))
const settings = lazyPage(() => import('@/features/settings/SettingsPage').then((m) => ({ Component: m.SettingsPage })))
const assistant = lazyPage(() => import('@/features/assistant/AssistantPage').then((m) => ({ Component: m.AssistantPage })))
const maps = lazyPage(() => import('@/features/maps/MapsPage').then((m) => ({ Component: m.MapsPage })))
const coherence = lazyPage(() => import('@/features/coherence/CoherencePage').then((m) => ({ Component: m.CoherencePage })))
const history = lazyPage(() => import('@/features/history/HistoryPage').then((m) => ({ Component: m.HistoryPage })))
const campaignSettings = lazyPage(() =>
  import('@/features/campaign-settings/CampaignSettingsPage').then((m) => ({ Component: m.CampaignSettingsPage })),
)

export const routes = [
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <CampaignsPage /> },
      { path: '/ajustes', ...settings },
      {
        path: '/c/:cid',
        element: <CampaignLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'explorar', element: <ExplorerPage /> },
          { path: 'explorar/:tipo', element: <ExplorerPage /> },
          { path: 'e/:eid', element: <EntityPage /> },
          { path: 'e/:eid/editar', element: <EntityFormPage /> },
          { path: 'nueva/:clase', element: <EntityFormPage /> },
          { path: 'grafo', ...graph },
          { path: 'sesiones', ...sessions },
          { path: 'propuestas', ...proposals },
          { path: 'propuestas/:pid', ...proposals },
          { path: 'sparql', ...sparql },
          { path: 'asistente', ...assistant },
          { path: 'mapas', ...maps },
          { path: 'mapas/:mid', ...maps },
          { path: 'coherencia', ...coherence },
          { path: 'historial', ...history },
          { path: 'ajustes', ...campaignSettings },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
