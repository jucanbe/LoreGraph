# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/);
versiones según [SemVer](https://semver.org/lang/es/).

## [0.1.0] — 2026-10-13

Primera versión publicada.

### Núcleo
- Mundo de cada campaña como grafo de conocimiento RDF (pyoxigraph persistente) con
  grafos con nombre: canon, derivado, procedencia, propuestas y conocimiento de cada
  personaje.
- Ontología base `rpg:` en inglés con etiquetas en español e inglés; relaciones
  cualificadas con tipo, intensidad y vigencia por sesión.
- Procedencia PROV-O de cada cambio, con historial por entidad y de la campaña y
  **deshacer** (con detección de conflictos).
- **Temporalidad completa**: ubicación, facción, posesiones y estado guardan su
  historia por sesiones; el grafo puede verse en cualquier sesión.
- Formularios generados desde SHACL y validación SHACL en cada escritura.
- **Detector de incoherencias** con comprobaciones SPARQL del núcleo y de los módulos.
- Búsqueda de texto completo, editor SPARQL con autocompletado y federación propia con
  Wikidata y DBpedia (caché y límites de tiempo). Nunca `owl:sameAs` hacia el mundo real.
- Retratos y **mapas propios** con marcadores; **exportar/importar** campañas en ZIP.

### Agentes
- Servidor MCP (solo lectura + propuestas validadas; nunca escribe en el canon).
- Asistente interno con PydanticAI pensado para **modelos locales** (Ollama, LM Studio…).
- **Generador con IA** de entidades con historia propia y fichas alineadas con las
  estadísticas del sistema (esquema de salida derivado de SHACL + validación + reintentos).
- Contexto para modelos de lenguaje por módulo (`context.yaml`) y **lore propio de la
  campaña**.

### Interfaz
- React + TypeScript: panel, explorador, fichas, formularios dinámicos, grafo
  (Cytoscape) con vista epistémica y por sesión, sesiones, propuestas con diff,
  SPARQL, mundo real (Leaflet + OSM), asistente, coherencia, historial, mapas y ajustes.
- Paleta de órdenes (Ctrl/Cmd+K), modo claro/oscuro, tema visual por módulo,
  español e inglés.

### Módulos
- **Vampiro: La Mascarada 5.ª ed.** (no oficial) con la campaña de ejemplo
  «Noches de Madrid» enlazada a Wikidata.
- **D&D 5e** basado en el SRD 5.1 (CC BY 4.0) con la campaña de ejemplo «La Costa de Ceniza».

[0.1.0]: https://github.com/OWNER/loregraph/releases/tag/v0.1.0
