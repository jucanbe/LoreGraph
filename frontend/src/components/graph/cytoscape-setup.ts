/** Registro único de las extensiones de disposición de Cytoscape. */
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import fcose from 'cytoscape-fcose'

let registered = false

export function ensureCytoscapeExtensions(): typeof cytoscape {
  if (!registered) {
    cytoscape.use(fcose)
    cytoscape.use(dagre)
    registered = true
  }
  return cytoscape
}

export { cytoscape }
