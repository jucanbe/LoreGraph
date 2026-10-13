# D&D 5.ª edición (SRD 5.1): cómo crear contenido

Trabajas en una campaña de Dungeons & Dragons 5.ª edición guardada como grafo RDF.
Prefijos: `rpg:` (núcleo), `dnd:` (este módulo). Usa solo contenido del SRD 5.1 o
inventado; no copies texto de manuales. Escribe nombres y descripciones en español.

## Qué clase usar

| Quiero crear…                         | `clases`                                          |
|---------------------------------------|---------------------------------------------------|
| PJ o PNJ con clase (guerrero, mago…)  | `rpg:PlayerCharacter` o `rpg:NonPlayerCharacter` + `dnd:Adventurer` |
| Monstruo concreto (un dragón, un trasgo con nombre) | `rpg:NonPlayerCharacter` + `dnd:Creature` |
| Ciudad o aldea / mazmorra             | `dnd:Settlement` / `dnd:Dungeon` (o `rpg:Place`)  |
| Arma / armadura / objeto mágico       | `dnd:Weapon` / `dnd:Armor` / `dnd:MagicItem`      |
| Facción, evento, trama, sesión        | `rpg:Faction`, `rpg:Event`, `rpg:Plot`, `rpg:Session` |

Los catálogos del módulo ya existen y se referencian por clave, no se crean:
clases `dnd:class-fighter`…, subclases `dnd:subclass-champion`…, especies
`dnd:species-human`, `dnd:species-hill-dwarf`…, trasfondo `dnd:background-acolyte`,
conjuros `dnd:spell-fireball`…, bestiario `dnd:monster-goblin`, `dnd:monster-young-red-dragon`…

## Propiedades clave

* Características: `dnd:strength`, `dnd:dexterity`, `dnd:constitution`,
  `dnd:intelligence`, `dnd:wisdom`, `dnd:charisma` (enteros 1–30).
* Combate: `dnd:armorClass`, `dnd:hitPointMax`, `dnd:currentHitPoints`, `dnd:speed` (pies).
* Origen: `dnd:species`, `dnd:background`, `dnd:alignment` (`dnd:align-lg`, `dnd:align-ng`,
  `dnd:align-cg`, `dnd:align-ln`, `dnd:align-n`, `dnd:align-cn`, `dnd:align-le`,
  `dnd:align-ne`, `dnd:align-ce`, `dnd:align-unaligned`).
* **Clases y niveles**: `dnd:hasClassLevel` es un objeto anidado, uno por clase
  (multiclase = varios): `{"valores": {"dnd:characterClass": ["dnd:class-rogue"], "dnd:levels": [3], "dnd:subclass": ["dnd:subclass-thief"]}}`.
  La suma no puede pasar de 20 ni repetir clase. **No escribas** nivel total,
  bonificador de competencia ni modificadores: los calculan las reglas.
* Competencias: `dnd:skillProficiency` / `dnd:skillExpertise` (`dnd:skill-stealth`,
  `dnd:skill-perception`…), `dnd:savingThrowProficiency` (`dnd:ability-str`…).
* Conjuros: `dnd:spellcastingAbility`, `dnd:spellSaveDC`, `dnd:spellAttackBonus`,
  `dnd:knowsSpell`, `dnd:preparedSpell` (referencias a `dnd:spell-…`).
* Criaturas: `dnd:statBlock` (entrada del bestiario) y solo los valores que cambien;
  `dnd:challengeRating` es decimal (0.25 = 1/4).
* Estados: `dnd:currentCondition` (`dnd:cond-poisoned`, `dnd:cond-prone`…).
* Relaciones cualificadas (`rpg:hasRelationship`): tipos del núcleo (`rpg:rel-ally`,
  `rpg:rel-enemy`, `rpg:rel-debt`, `rpg:rel-employer`, `rpg:rel-mentor`…) y de D&D:
  `dnd:rel-patron` (el destino es su mecenas), `dnd:rel-party-member`,
  `dnd:rel-sworn-enemy`, `dnd:rel-rival-party`.
* Mundo real: `rpg:inspiredBy` (criatura mitológica de Wikidata) o
  `rpg:correspondsTo` (lugar real). Nunca `owl:sameAs`.

## Ejemplo de propuesta

```json
{
  "agente": "mi-agente",
  "peticion": "Crea una pícara mediana que trabaje para la Cofradía",
  "entidades": [
    {
      "ref": "nuevo:1",
      "clases": ["rpg:NonPlayerCharacter", "dnd:Adventurer"],
      "valores": {
        "rdfs:label": ["Brizna Pocasal"],
        "schema:description": ["Mediana ratera de los muelles que espía para la Cofradía."],
        "dnd:species": ["dnd:species-lightfoot-halfling"],
        "dnd:alignment": ["dnd:align-cn"],
        "dnd:hasClassLevel": [
          {"valores": {"dnd:characterClass": ["dnd:class-rogue"], "dnd:levels": [3], "dnd:subclass": ["dnd:subclass-thief"]}}
        ],
        "dnd:dexterity": [17], "dnd:armorClass": [14], "dnd:hitPointMax": [21],
        "dnd:skillProficiency": ["dnd:skill-stealth", "dnd:skill-sleight-of-hand"],
        "rpg:memberOf": ["cofradia-sal"],
        "rpg:hasRelationship": [
          {"valores": {"rpg:target": ["leonor"], "rpg:relationshipType": ["dnd:rel-patron"], "rpg:strength": [1]}}
        ]
      }
    }
  ]
}
```

Las referencias a entidades de la campaña usan su id (`cofradia-sal`); las de
catálogo, su clave compacta (`dnd:class-rogue`); las entidades nuevas de la misma
propuesta, su `ref` (`nuevo:1`).
