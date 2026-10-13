# Cómo escribir un módulo de sistema de juego

Un módulo es una carpeta autocontenida dentro de `modules/`. El núcleo la descubre
al arrancar; **no hay que tocar ni el backend ni el frontend** para añadir uno.

```
modules/<id>/
├─ manifest.yaml        # obligatorio
├─ ontology.ttl         # clases y propiedades (extienden rpg:)
├─ shapes.ttl           # formas SHACL: validación + formularios
├─ vocabulary.ttl       # catálogos (conceptos SKOS e instancias de referencia)
├─ rules/*.rq           # reglas CONSTRUCT → grafo derivado
├─ queries/*.rq         # consultas SPARQL de ejemplo para el editor
├─ context.yaml         # lore, estadísticas, reglas y glosario para modelos de lenguaje
├─ prompts/*.md         # convenciones para agentes de IA (cómo proponer datos)
├─ assets/              # fuentes, texturas (servidas en /modulos/<id>/assets/)
└─ examples/<campaña>/  # campañas de ejemplo (`make seed`)
```

## IRIs

* El núcleo vive en `https://loregraph.example.org/ont/core#` (prefijo `rpg:`).
* **Cada módulo usa su propio dominio** (provisional: `https://rpg-modules.example.net/<id>/ont#`),
  declarado en `manifest.yaml` → `iri`, con su `prefijo` (p. ej. `vtm:`).
* Las formas pueden usar un segundo espacio de nombres (`…/<id>/shapes#`).
* Los datos de campaña los acuña el núcleo; en los ejemplos se escribe
  `@prefix : <__CAMPAIGN__/entity/> .` y el cargador sustituye `__CAMPAIGN__`.

## Manifiesto

```yaml
id: vtm5
nombre: { es: "…", en: "…" }
descripcion: { es: "…", en: "…" }
version: 0.1.0
categoria: sistema          # nucleo | sistema | extension
iri: https://rpg-modules.example.net/vtm5/ont#
prefijo: vtm
licencia: …
depende_de: { core: ">=0.1" }
prefijos: { vtmsh: "https://rpg-modules.example.net/vtm5/shapes#" }
clases_principales: [vtm:Domain, vtm:Clan]      # pestañas extra del explorador
estilos_tipos:   { vtm:Vampire: { color: "#9f1239", forma: ellipse, icono: droplet } }
estilos_relaciones: { vtm:sire: { color: "#7f1d1d", linea: solid, ancho: 2 } }
tema:
  radio: "0.25rem"
  fuentes: { titulos: "'Cinzel', serif", texto: "…", archivos: [] }
  claro:  { background: "#…", foreground: "#…", primary: "#…", … }   # tokens de shadcn/ui
  oscuro: { … }
```

Tokens de tema admitidos: `background, foreground, card, card-foreground, popover,
popover-foreground, primary, primary-foreground, secondary, secondary-foreground,
muted, muted-foreground, accent, accent-foreground, destructive,
destructive-foreground, border, input, ring, sidebar, sidebar-foreground`.
El tema del último módulo de categoría `sistema` activo es el que se aplica.

## Ontología

* Identificadores en inglés; `rdfs:label` y `rdfs:comment` **en `@es` y `@en`** para todo.
* Las clases de módulo que describen *qué es* un personaje (vampiro, aventurero…)
  son subclases de `rpg:Character` y se marcan con `rpg:variantOf rpg:Character`.
  Así se combinan con el rol (PJ/PNJ): una entidad puede ser
  `rpg:NonPlayerCharacter` **y** `vtm:Vampire`.
* Los catálogos cerrados y pequeños (sectas, estados…) son conceptos SKOS
  (`skos:ConceptScheme` + `skos:inScheme`).
* Los catálogos ricos (clanes, disciplinas) son instancias de una clase del módulo
  en `vocabulary.ttl`; aparecen en el explorador como entidades de solo lectura.
* Las relaciones cualificadas propias del sistema son subclases de `rpg:Relationship`
  o nuevos conceptos en `rpg:RelationshipTypes`.
* **Nunca** `owl:sameAs` hacia recursos reales: `rpg:inspiredBy` / `rpg:correspondsTo`.

## Formas SHACL → formularios

| SHACL                                             | Campo del formulario        |
|---------------------------------------------------|-----------------------------|
| `sh:datatype xsd:string`                          | `texto`                     |
| `… + dash:editor dash:TextAreaEditor`             | `textoLargo`                |
| `sh:datatype xsd:integer / decimal / boolean / date` | `entero / decimal / booleano / fecha` |
| `… + dash:editor rpg:DotsEditor`                  | widget `puntos` (●●●○○)     |
| `sh:in ( … )`                                     | `enum`                      |
| `sh:class skos:Concept ; rpg:conceptScheme X`     | `enum` con los conceptos de X |
| `sh:class C` o `sh:or ([sh:class A] [sh:class B])`| `referencia` (selector con búsqueda) |
| `sh:node S ; dash:editor dash:DetailsEditor`      | `objeto` (subformulario anidado) |
| `rpg:backlink rpg:source` (en el anidado)         | el nodo anidado apunta a su dueño |
| `sh:nodeKind sh:IRI`                              | `iri`                       |
| `sh:minCount / sh:maxCount`                       | cardinalidad                |
| `sh:group` + `sh:order`                           | agrupación y orden          |
| `sh:name` / `sh:description` (`@es`, `@en`)        | etiqueta y ayuda            |
| `dash:hidden true`                                | campo oculto                |

Los módulos pueden añadir campos a clases del núcleo con una forma cuyo
`sh:targetClass` sea la clase del núcleo, o definir formas para sus propias clases.

## Contexto para modelos de lenguaje (`context.yaml`)

Los modelos pequeños no conocen la ambientación ni las reglas del sistema de juego.
`context.yaml` se lo explica de forma estructurada. Todo va **con tus propias palabras**,
y cada texto puede ser una cadena o `{es: …, en: …}`.

```yaml
resumen: { es: "Ambientación, premisa y tono general…", en: "…" }
estadisticas:                       # qué significa cada estadística
  - clave: vtm:hunger
    explicacion: { es: "Cuánta sangre necesita ahora…" }
    escala: { es: "0 = saciado; 5 = al borde de perder el control" }
reglas:                             # mecánicas clave resumidas
  - { es: "Romper la Mascarada es el peor crimen…" }
glosario:
  - { termino: Abrazo, clave: null, definicion: { es: "Convertir a un mortal en vástago." } }
tono: { es: "Gótico-punk, intriga política…" }
evitar:
  - { es: "Mezclar elementos de otros juegos…" }
```

**Estadísticas.** El rango (`sh:minInclusive`/`sh:maxInclusive`), los valores permitidos
(`sh:in` o un esquema SKOS) y las clases a las que se aplica se **sacan solos de las formas
SHACL**, así que nunca se desincronizan. El YAML solo añade la explicación y la escala.

**Uso por los agentes:**
- El asistente interno lo recibe en sus instrucciones, recortado según
  `LOREGRAPH_LLM_CONTEXT_TOKENS`.
- Los agentes MCP tienen la herramienta `contexto_sistema` y el recurso
  `loregraph://campanas/{campana}/contexto`.
- También está en la API: `GET /campanas/{cid}/contexto-llm?max_caracteres=…`.

**Prioridad al recortar.** Se descarta, en este orden:
1. El glosario.
2. Las estadísticas sin explicar.
3. Tono y «evitar».
4. Las escalas.
5. Las reglas.

Los resúmenes de la campaña y del sistema se mantienen siempre.

Los `prompts/*.md` siguen sirviendo para las **convenciones de la ontología**: qué clases y
propiedades usar al proponer datos, con ejemplos de JSON.

## Reglas, consultas y prompts

* `rules/*.rq`: `CONSTRUCT` que se ejecutan sobre el canon tras cada escritura;
  el resultado se guarda en `<campaña>/derived`.
* `queries/*.rq`: cabecera `# titulo:` y `# descripcion:`; aparecen como ejemplos
  en el editor SPARQL.
* `checks/*.rq`: comprobaciones de coherencia. Consultas `SELECT` que devuelven
  `?entidad` y, opcionalmente, `?mensaje` y una o varias `?relacionada`. Cabecera:

  ```sparql
  # titulo: Generación incoherente con el sire
  # titulo_en: Generation inconsistent with the sire
  # severidad: error          # o «aviso»
  # descripcion: Un chiquillo no puede tener una generación igual o más baja que la de su sire.
  ```
* `prompts/*.md`: instrucciones para agentes. Los archivos `agente*.md`,
  `sistema.md` y `convenciones.md` se añaden al prompt del asistente interno;
  todos se publican como prompts MCP.

## Derechos de autor

Describe las mecánicas **con tus propias palabras**. No copies texto de manuales
con copyright. Los datos de un SRD bajo licencia abierta (p. ej. SRD 5.1, CC-BY-4.0)
pueden usarse respetando su licencia y atribución.
