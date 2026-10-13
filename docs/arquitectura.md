# Arquitectura — Gestor de campañas de rol sobre RDF

Documento vivo. Recoge las decisiones aprobadas en la Fase 1 (plan).

## Convenciones

- **Identificadores de la ontología en inglés** (clases en `UpperCamelCase`,
  propiedades en `lowerCamelCase`).
- **Etiquetas y comentarios bilingües**: cada término lleva `rdfs:label` y
  `rdfs:comment` en `@es` y `@en`. La API elige el idioma según
  `Accept-Language` (por defecto `es`, respaldo `en`).
- La interfaz está en español primero, con i18n (react-i18next).
- Espacio de nombres del núcleo: `rpg: <https://loregraph.example.org/ont/core#>`
  (provisional; cambiarlo implica migración, decidir antes de datos reales).
- Cada módulo declara su propio prefijo e IRI (`vtm:`, `dnd:`).

## Estructura de carpetas

```
KG Platform/
├─ Makefile                  # atajos → tasks.py
├─ tasks.py                  # ejecutor multiplataforma (stdlib): install|dev|test|seed|types
├─ .env.example
├─ docs/
├─ data/                     # (ignorado) almacén oxigraph, sqlite auxiliar, media/
├─ modules/
│  ├─ vtm5/  manifest.yaml ontology.ttl shapes.ttl vocabulary.ttl rules/ prompts/ assets/ examples/
│  └─ dnd5e/
├─ backend/
│  ├─ pyproject.toml
│  ├─ src/loregraph/
│  │  ├─ config.py  main.py  namespaces.py  cli.py
│  │  ├─ ontology/            # core.ttl, core-shapes.ttl
│  │  ├─ store/               # pyoxigraph, transacciones, grafos, conversión ↔ rdflib
│  │  ├─ provenance/          # registro de cambios PROV-O
│  │  ├─ modules/             # manifiesto, descubrimiento, dependencias
│  │  ├─ validation/          # pySHACL sobre subgrafos
│  │  ├─ forms/               # SHACL → esquema de formulario
│  │  ├─ services/            # campañas, entidades, grafo, epistémico, propuestas, búsqueda, sparql, mundo real, reglas
│  │  ├─ tools/               # herramientas para agentes (definidas una vez, expuestas por MCP y por el SDK)
│  │  ├─ api/routers/
│  │  └─ mcp/server.py
│  └─ tests/
└─ frontend/  (React + Vite + TS estricto)
```

## Ontología base (`rpg:`)

| Concepto (es)      | Término                     | Alineamiento            |
|--------------------|-----------------------------|-------------------------|
| Campaña            | `rpg:Campaign`              | `schema:CreativeWork`   |
| Personaje (abstr.) | `rpg:Character`             | `foaf:Agent`            |
| Personaje jugador  | `rpg:PlayerCharacter`       | ⊑ `rpg:Character`       |
| PNJ                | `rpg:NonPlayerCharacter`    | ⊑ `rpg:Character`       |
| Jugador            | `rpg:Player`                | `prov:Person`           |
| Lugar              | `rpg:Place`                 | `schema:Place`          |
| Facción            | `rpg:Faction`               | `foaf:Organization`     |
| Objeto             | `rpg:Item`                  |                         |
| Evento (en el mundo)| `rpg:Event`                | `schema:Event`          |
| Sesión (real)      | `rpg:Session`               | `schema:Event`          |
| Trama              | `rpg:Plot` + `rpg:plotStatus` (open/resolved/abandoned, SKOS) | |

Propiedades: `rdfs:label` (nombre), `skos:altLabel`, `schema:description`,
`rpg:locatedIn`, `rpg:memberOf`, `rpg:knows`, `rpg:relatedTo`,
`rpg:participatesIn`, `rpg:possesses`, `rpg:occursIn`, `rpg:appearsInSession`,
`rpg:playedBy`, `rpg:usesModule`.

Enlace con el mundo real: `rpg:realWorldAnchor` (super-propiedad) con
`rpg:inspiredBy` y `rpg:correspondsTo` (lugar ficticio situado en uno real →
coordenadas). **Nunca `owl:sameAs`**: una forma SHACL del núcleo lo rechaza
hacia IRIs externas a la campaña.

## Relaciones cualificadas y temporalidad

Patrón elegido: **nodo n-ario (relación cualificada)** en dos capas, como
Wikidata (`p:` / `wdt:`):

1. **Hecho cualificado** (`rpg:Fact` y subclases): fuente de verdad para las
   propiedades marcadas `rpg:isTemporal true`. Lleva tipo, valor, vigencia y
   procedencia.
2. **Atajo directo** (`:a rpg:relatedTo :b`): estado actual, derivado por regla
   CONSTRUCT en `<campaña>/derived`.

Descartados: reificación `rdf:Statement` (verbosa) y RDF-star/RDF 1.2 (poco
soporte en pySHACL/rdflib; una misma tripleta no puede tener dos vigencias sin
*reifiers*).

```turtle
# --- Ontología ---
rpg:Fact a owl:Class ;
    rdfs:label "Hecho"@es , "Fact"@en ;
    rdfs:comment "Afirmación cualificada con vigencia y procedencia propias."@es ,
                 "Qualified statement with its own validity and provenance."@en .

rpg:Relationship a owl:Class ; rdfs:subClassOf rpg:Fact ;
    rdfs:label "Relación"@es , "Relationship"@en ;
    rdfs:comment "Relación cualificada entre dos personajes o facciones: tipo, intensidad y vigencia."@es ,
                 "Qualified relationship between two characters or factions: type, strength and validity."@en .

rpg:hasRelationship a owl:ObjectProperty ;
    rdfs:domain rpg:Character ; rdfs:range rpg:Relationship ;
    rdfs:label "tiene relación"@es , "has relationship"@en .

rpg:source a owl:ObjectProperty , owl:FunctionalProperty ;
    rdfs:domain rpg:Relationship ;
    rdfs:label "origen"@es , "source"@en .

rpg:target a owl:ObjectProperty , owl:FunctionalProperty ;
    rdfs:domain rpg:Relationship ;
    rdfs:label "destino"@es , "target"@en .

rpg:relationshipType a owl:ObjectProperty ;
    rdfs:domain rpg:Relationship ; rdfs:range skos:Concept ;
    rdfs:label "tipo de relación"@es , "relationship type"@en .

rpg:strength a owl:DatatypeProperty , owl:FunctionalProperty ;
    rdfs:domain rpg:Relationship ; rdfs:range xsd:integer ;
    rdfs:label "intensidad"@es , "strength"@en ;
    rdfs:comment "De -3 (hostilidad extrema) a +3 (lealtad absoluta)."@es ,
                 "From -3 (extreme hostility) to +3 (absolute loyalty)."@en .

rpg:validFrom  a owl:ObjectProperty ; rdfs:domain rpg:Fact ;
    rdfs:label "vigente desde"@es , "valid from"@en .   # rango: rpg:Session o time:Instant
rpg:validUntil a owl:ObjectProperty ; rdfs:domain rpg:Fact ;
    rdfs:label "vigente hasta"@es , "valid until"@en .  # exclusivo

rpg:relatedTo a owl:ObjectProperty ;
    rpg:isTemporal true ;
    rpg:qualifiedBy rpg:Relationship ;
    rdfs:label "relacionado con"@es , "related to"@en ;
    rdfs:comment "Atajo derivado: existe si hay una rpg:Relationship vigente."@es ,
                 "Derived shortcut: holds while an rpg:Relationship is valid."@en .

# Tipos de relación (SKOS; los módulos añaden más, p. ej. vtm:BloodBond)
rpg:RelationshipTypes a skos:ConceptScheme .
rpg:rel-ally  a skos:Concept ; skos:inScheme rpg:RelationshipTypes ; skos:prefLabel "aliado"@es , "ally"@en .
rpg:rel-rival a skos:Concept ; skos:inScheme rpg:RelationshipTypes ; skos:prefLabel "rival"@es , "rival"@en .
rpg:rel-debt  a skos:Concept ; skos:inScheme rpg:RelationshipTypes ; skos:prefLabel "deuda"@es , "debt"@en .
rpg:rel-lover a skos:Concept ; skos:inScheme rpg:RelationshipTypes ; skos:prefLabel "amante"@es , "lover"@en .

# --- Forma SHACL ---
rpg:RelationshipShape a sh:NodeShape ;
    sh:targetClass rpg:Relationship ;
    sh:property [ sh:path rpg:target ; sh:class rpg:Character ; sh:minCount 1 ; sh:maxCount 1 ;
                  sh:name "destino"@es , "target"@en ; sh:order 1 ] ,
                [ sh:path rpg:relationshipType ; sh:class skos:Concept ; sh:minCount 1 ;
                  sh:name "tipo"@es , "type"@en ; sh:order 2 ] ,
                [ sh:path rpg:strength ; sh:datatype xsd:integer ; sh:maxCount 1 ;
                  sh:minInclusive -3 ; sh:maxInclusive 3 ; sh:order 3 ] ,
                [ sh:path rpg:validFrom ; sh:maxCount 1 ; sh:order 4 ] ,
                [ sh:path rpg:validUntil ; sh:maxCount 1 ; sh:order 5 ] .

# --- Datos ---
:lucia rpg:hasRelationship :rel-42 .
:rel-42 a rpg:Relationship ;
    rpg:source :lucia ; rpg:target :don-ernesto ;
    rpg:relationshipType rpg:rel-debt ;
    rpg:strength -2 ;
    rpg:validFrom :session-03 ;
    rpg:validUntil :session-07 .
```

Regla de derivación (estado actual) en `rules/current-relationships.rq`:

```sparql
CONSTRUCT { ?a rpg:relatedTo ?b }
WHERE {
  ?r a rpg:Relationship ; rpg:source ?a ; rpg:target ?b .
  FILTER NOT EXISTS { ?r rpg:validUntil ?fin }
}
```

Estado del mundo en la sesión N (lo que usará la barra temporal):

```sparql
SELECT ?a ?b ?tipo WHERE {
  ?r a rpg:Relationship ; rpg:source ?a ; rpg:target ?b ; rpg:relationshipType ?tipo .
  OPTIONAL { ?r rpg:validFrom/rpg:sessionNumber ?desde }
  OPTIONAL { ?r rpg:validUntil/rpg:sessionNumber ?hasta }
  FILTER ((!BOUND(?desde) || ?desde <= ?N) && (!BOUND(?hasta) || ?N < ?hasta))
}
```

Dos ejes temporales: orden de sesiones (`rpg:sessionNumber`) y cronología del
mundo (`time:Instant`; `xsd:dateTime` o `time:GeneralDateTimeDescription` para
calendarios inventados).

Las relaciones (`rpg:Relationship`) llevan su vigencia explícita. Para el resto de
propiedades temporales (`rpg:isTemporal true`: `locatedIn`, `memberOf`, `possesses`,
estado…) la tripleta directa es siempre el **estado actual**, y cada cambio deja
historia en hechos `rpg:TemporalStatement` (o la subclase indicada con
`rpg:qualifiedBy`) anidados en la entidad (`<entidad>/n/h-…`, enlazados con
`rpg:hasHistory`):

* al añadir un valor se abre un hecho con `validFrom` = sesión actual;
* al quitarlo se cierra con `validUntil` = sesión actual.

La «sesión actual» se elige en los ajustes de la campaña (si no, la de número más
alto). No generan historia la creación de entidades, el borrado, la semilla ni
deshacer. La vista de grafo en la sesión N usa la historia cuando existe y la tripleta
directa cuando no.

## Grafos con nombre

```
<campaña>/canon
<campaña>/derived                 # salida de reglas, regenerable
<campaña>/provenance              # rpg:Change (prov:Activity) con tripletas añadidas/eliminadas reificadas
<campaña>/proposals               # metadatos de propuestas
<campaña>/proposals/<id>          # tripletas de cada propuesta
<campaña>/knowledge/<personaje>   # creencias (confirmada / falsa / no verificada vs. canon)
<módulo>/ontology, <módulo>/vocabulary
```

Fuera del triple store, en SQLite (`data/aux.sqlite`): índice de búsqueda (FTS5),
caché de federación, consultas guardadas, ajustes generales y de cada campaña (lore,
modelo propio, sesión actual) e incoherencias ignoradas. Las imágenes subidas se
guardan en `data/media/<campaña>/` y se describen en el canon como nodos `rpg:Image`
(`schema:contentUrl`, origen y, si las genera una IA, el prompt).

## Coherencia

`checks/*.rq` (núcleo y módulos): consultas `SELECT ?entidad ?mensaje ?relacionada`
con cabecera `# titulo:`, `# titulo_en:`, `# severidad: error|aviso` y
`# descripcion:`. Se ejecutan sobre canon + derivado + ontologías. Cada incoherencia
tiene un id estable (regla + ids locales), así que las marcadas como intencionadas
siguen ignoradas tras exportar e importar.

## Deshacer

Deshacer un cambio aplica el inverso como un cambio nuevo (`rpg:reverts`) con su propia
procedencia y validación SHACL. Se rechaza (409) si un cambio posterior —que no sea ya
un deshacer— tocó las mismas tripletas, o si ya estaba deshecho.

## Exportar e importar

ZIP con `loregraph.json` (formato, versión, IRI base, campaña, versiones de módulos,
ajustes, consultas guardadas, incoherencias ignoradas), `grafos.nq` (todos los grafos
de la campaña) y `media/`. Al importar se reescriben las IRIs de la campaña y de la base
de origen, se comprueba que estén los módulos (avisando si cambió su versión) y se
reconstruyen lo derivado y el índice de búsqueda.

## Agentes

- **Agentes externos** (Claude Code, Claude Desktop, cualquier cliente MCP):
  servidor MCP con el SDK oficial `mcp` (FastMCP), montado en FastAPI en `/mcp`
  (Streamable HTTP) porque RocksDB solo admite un proceso escritor.
- **Agentes internos** (extracción de transcripciones, generación de PNJ,
  asistente en la interfaz; fases futuras): **PydanticAI**, pensado sobre todo
  para **modelos locales** (Ollama, LM Studio, llama.cpp, vLLM, cualquier
  endpoint compatible con OpenAI), sin excluir proveedores en la nube.
  Las herramientas se definen una sola vez en `loregraph/tools/` y se registran
  tanto en MCP como en PydanticAI.
- En ambos casos los agentes solo escriben mediante propuestas; la aprobación
  es humana.

### Diseño pensando en modelos locales

Los modelos locales tienen menos contexto y son menos fiables generando RDF y
SPARQL, así que:

- **Configuración** en `.env`: `LLM_PROVIDER` (por defecto `ollama`),
  `LLM_BASE_URL` (`http://localhost:11434/v1`), `LLM_MODEL`, `LLM_API_KEY`
  (opcional), `LLM_CONTEXT_TOKENS` y `LLM_TIMEOUT`.
- **Propuestas estructuradas**: `proponer_triples` acepta un modelo Pydantic
  (entidades con clase, etiqueta y propiedades por clave compacta; relaciones
  cualificadas como objetos) que el backend traduce a RDF. Turtle se admite
  como entrada opcional para modelos capaces.
- **Validación con reintento**: los errores de Pydantic/SHACL vuelven al modelo
  como mensajes legibles (en español) para que corrija, con un número máximo de
  reintentos.
- **Herramientas de alto nivel** (buscar, describir, vecinos, relaciones,
  estado en la sesión N) para que el SPARQL libre sea opcional; cuando se use,
  el prompt incluye los prefijos y ejemplos del módulo.
- **Salidas compactas**: las herramientas devuelven texto resumido con
  etiquetas legibles y claves cortas (no IRIs largas), paginado y con un límite
  de tamaño acorde a `LLM_CONTEXT_TOKENS`.
- **Prompts por módulo** (`modules/<id>/prompts/`) cortos y en español, con el
  vocabulario del sistema de juego.
- **Tests sin red**: los agentes se prueban con los modelos de prueba de
  PydanticAI (respuestas deterministas), sin depender de un modelo instalado.
- **Futuro**: búsqueda semántica con embeddings locales como complemento al
  índice FTS5.

## Decisiones tomadas durante la implementación

- **Dominios provisionales**:
  - Núcleo: `https://loregraph.example.org/ont/core#`.
  - Datos: `https://loregraph.example.org/data/…`, configurable con `LOREGRAPH_BASE_IRI`.
  - Módulos, en otro dominio: `https://rpg-modules.example.net/<id>/ont#`.
- **Federación propia** (`services/federation.py`). pyoxigraph puede colgarse o abortar
  el proceso con algunas respuestas remotas de `SERVICE`, así que el backend nunca le
  deja hacer HTTP. En su lugar:
  1. Localiza los bloques `SERVICE`.
  2. Obtiene en local los valores de las variables de unión.
  3. Consulta el endpoint por lotes con `VALUES`.
  4. Sustituye cada bloque por un `VALUES` con las respuestas.

  Solo se admiten endpoints configurados (evita SSRF). Las respuestas se guardan en caché
  (SQLite) y el User-Agent cumple la política de Wikidata.
- **Validación SHACL** sobre un subgrafo: la entidad, sus nodos anidados y los tipos de
  lo que referencia. Los resultados se filtran a los nodos afectados. No se usa
  `focus_nodes` porque pySHACL no evalúa bien `sh:or`/`sh:node` con él.
- **Campos ocultos con valor fijo** (`dash:hidden` + `sh:defaultValue`): el backend los
  rellena solo. Así funcionan, por ejemplo, el tipo de relación de `vtm:BloodBond` y el
  de `vtm:Boon`.
- **Variantes** (`rpg:variantOf`): las clases de criatura de los módulos (vástago,
  aventurero…) se combinan con el rol PJ/PNJ.
- **Esquema de respuestas**: los campos con valor por defecto son obligatorios en el
  OpenAPI (`ApiModel`), así que los tipos TypeScript no los tratan como opcionales.
- **Puerto de la API**: 8765 (el 8000 suele estar ocupado).

## Pendiente (diseñado, no implementado)

- Extracción de entidades desde transcripciones (sería otro productor de propuestas).
- Generación de imágenes con IA local (el modelo `rpg:Image` ya guarda origen y prompt).
- Portal de jugadores (vista epistémica con autenticación).
- Dominio definitivo para las IRIs.
- npm como gestor de paquetes del frontend.
