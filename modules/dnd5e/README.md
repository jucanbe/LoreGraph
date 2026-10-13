# Módulo `dnd5e`: Dungeons & Dragons 5.ª edición (SRD 5.1)

Módulo de sistema de juego para el gestor de campañas. Modela personajes, criaturas,
clases, especies, conjuros y bestiario de D&D 5.ª edición usando **solo** el
*System Reference Document 5.1*. Todas las descripciones son paráfrasis propias y
breves; del SRD solo se toman nombres y datos factuales (nivel y escuela de un
conjuro, dado de golpe de una clase, VD/CA/PG de un monstruo…).

## Atribución (CC-BY-4.0)

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1")
by Wizards of the Coast LLC and available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed
under the Creative Commons Attribution 4.0 International License available at
https://creativecommons.org/licenses/by/4.0/legalcode.

*Este trabajo incluye material del System Reference Document 5.1 («SRD 5.1») de
Wizards of the Coast LLC, disponible en la dirección anterior y publicado bajo la
licencia Creative Commons Reconocimiento 4.0 Internacional.* Dungeons & Dragons es una
marca de Wizards of the Coast; este módulo no está afiliado a ella ni la respalda.

La campaña de ejemplo `examples/costa-ceniza/` es una ambientación original.

## Espacios de nombres

| Prefijo | IRI |
|---------|-----|
| `dnd:`   | `https://rpg-modules.example.net/dnd5e/ont#` |
| `dndsh:` | `https://rpg-modules.example.net/dnd5e/shapes#` |

## Modelo

* **Variantes de personaje** (`rpg:variantOf rpg:Character`), que se combinan con el
  rol del núcleo (PJ/PNJ):
  * `dnd:Adventurer`: especie, trasfondo, alineamiento, clases y niveles,
    características, combate, competencias y conjuros.
  * `dnd:Creature`: un monstruo concreto de la campaña. Apunta con `dnd:statBlock` a
    una entrada del bestiario y solo guarda lo que cambia (p. ej. más PG).
* **Multiclase**: cada clase es un nodo anidado `dnd:ClassLevel`
  (`dnd:characterClass`, `dnd:levels`, `dnd:subclass`) colgado con
  `dnd:hasClassLevel` (editor `dash:DetailsEditor`, enlace inverso
  `dnd:classLevelOf`). Dos restricciones SPARQL impiden repetir clase y superar
  nivel 20 en total.
* **Catálogos navegables** (subclases de `rpg:Entity`, en `vocabulary.ttl`):
  `dnd:CharacterClass` (12), `dnd:Subclass` (12), `dnd:Species` (9 + 4 subrazas),
  `dnd:Background` (Acólito), `dnd:Spell` (32, de trucos a nivel 5) y
  `dnd:Monster` (13 entradas de bestiario). Las campañas pueden añadir los suyos.
* **Conceptos SKOS**: características (6), habilidades (18, con su característica),
  alineamientos (9 + «sin alineamiento»), tamaños, tipos de criatura (14), estados
  (15), tipos de daño (13), escuelas de magia (8), categorías de arma y armadura,
  rarezas.
* **Objetos y lugares**: `dnd:Weapon`, `dnd:Armor`, `dnd:MagicItem` (⊑ `rpg:Item`);
  `dnd:Settlement`, `dnd:Dungeon` (⊑ `rpg:Place`).
* **Tipos de relación** añadidos a `rpg:RelationshipTypes`: mecenas, compañero de
  grupo, enemigo jurado y grupo rival.

## Reglas (`rules/`)

Se ejecutan sobre el canon y escriben en `<campaña>/derived`:

* `total-level-proficiency.rq`: `dnd:totalLevel` (suma de niveles) y
  `dnd:proficiencyBonus` = 2 + ⌊(nivel − 1) / 4⌋.
* `ability-modifiers.rq`: `dnd:strengthModifier`… = ⌊(puntuación − 10) / 2⌋.
* `creature-proficiency.rq`: bonificador de competencia de las criaturas según su VD
  (propio o el de su entrada del bestiario).

## Consultas de ejemplo (`queries/`)

Grupo con clases y niveles, conjuros por escuela, criaturas por VD (con herencia del
bestiario) y una federada con Wikidata para las criaturas inspiradas en la mitología.

## Campaña de ejemplo

`examples/costa-ceniza/`: «La Costa de Ceniza», una costa volcánica con cuatro PJ
(uno multiclase guerrero/pícaro y otro brujo/hechicero), una dragona roja que
despierta, un minotauro en un laberinto de lava y rivalidades entre grupos de
aventureros. Incluye creencias de un PJ (`knowledge/iria.ttl`, con rumores falsos)
y una propuesta de agente (`proposals/`). Se carga con:

```
uv run loregraph seed --campana costa-ceniza
```
