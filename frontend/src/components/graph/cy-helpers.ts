/** Operaciones imperativas sobre una instancia de Cytoscape. */
import type cytoscape from 'cytoscape'

/** Centra y amplía un nodo con animación; devuelve `false` si no existe. */
export function focusNode(cy: cytoscape.Core, id: string, zoom = 1.4): boolean {
  const node = cy.getElementById(id)
  if (node.empty()) return false
  cy.stop()
  cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), zoom) }, { duration: 350 })
  return true
}

/** Resalta un nodo y su vecindario y atenúa el resto (o limpia si `id` es nulo). */
export function highlightNeighborhood(cy: cytoscape.Core, id: string | null | undefined): void {
  cy.batch(() => {
    cy.elements().removeClass('faded highlight')
    if (!id) return
    const node = cy.getElementById(id)
    if (node.empty()) return
    const hood = node.closedNeighborhood()
    cy.elements().not(hood).addClass('faded')
    node.addClass('highlight')
  })
}
