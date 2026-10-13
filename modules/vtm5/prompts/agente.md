# Convenciones para agentes: Vampiro 5.ª ed.

Trabajas con la ontología `vtm:` (módulo no oficial). No copies texto de los manuales:
describe con tus palabras y deja los detalles de reglas a quien dirige.

## Personajes
- Un vástago PNJ tiene dos clases: `rpg:NonPlayerCharacter` y `vtm:Vampire`
  (PJ: `rpg:PlayerCharacter` + `vtm:Vampire`). Ghouls: `vtm:Ghoul`; humanos: `vtm:Mortal`.
- Campos habituales: `vtm:clan` (id de clan, p. ej. `vtm:clan-toreador`), `vtm:generation` (3–16),
  `vtm:sire` (id de otro vástago), `vtm:sect` (`vtm:sect-camarilla`, `vtm:sect-anarch`…),
  `vtm:position` (`vtm:position-sheriff`…), `vtm:hunger` (0–5), `vtm:humanity` (0–10),
  `vtm:bloodPotency` (0–10), `vtm:predatorType` (`vtm:predator-siren`…).
- Disciplinas: en `vtm:hasDisciplineRating` como objetos `{"vtm:discipline": ["vtm:discipline-auspex"], "vtm:dots": [2]}`.
- Vínculo de sangre (el personaje es el siervo): `vtm:hasBloodBond` con `{"rpg:target": [id regnante], "vtm:bondLevel": [1-3]}`.
- Favor debido: `vtm:hasBoon` con `{"rpg:target": [id acreedor], "vtm:boonWeight": ["vtm:boon-minor"]}`.
- Convicción: `vtm:hasConviction` con `{"vtm:convictionText": ["…"], "vtm:touchstone": [id del mortal]}`.

## Lugares
- Territorios: `vtm:Domain` (con `vtm:domainHolder`, `vtm:huntingQuality`, `vtm:masqueradeRisk`).
- Refugios: `vtm:Haven`. Elíseos: cualquier lugar con `vtm:isElysium` = true.
- Lugares reales de la ciudad: `rpg:correspondsTo` con la IRI de Wikidata (nunca `owl:sameAs`).

## Rumores y secretos
- Lo que un personaje cree (aunque sea falso) va con `destino: "conocimiento/<id del personaje>"`.
- No cambies el canon para encajar un rumor.

## Ejemplo de propuesta
```json
{
  "peticion": "Crea una arpía Toreador para el Elíseo",
  "entidades": [{
    "ref": "nuevo:1",
    "clases": ["rpg:NonPlayerCharacter", "vtm:Vampire"],
    "valores": {
      "rdfs:label": ["Celia Montalvo"],
      "vtm:clan": ["vtm:clan-toreador"],
      "vtm:sect": ["vtm:sect-camarilla"],
      "vtm:position": ["vtm:position-harpy"],
      "vtm:hasDisciplineRating": [{"vtm:discipline": ["vtm:discipline-presence"], "vtm:dots": [3]}]
    }
  }]
}
```
