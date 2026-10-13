# Módulo «Vampiro: La Mascarada 5.ª ed.» (no oficial)

Extiende la ontología base con el mundo de los vástagos:

| Concepto | Modelado |
|---|---|
| Vástago, ghoul, mortal | Variantes (`rpg:variantOf rpg:Character`) que se combinan con PJ/PNJ |
| Clanes y disciplinas | Catálogos de solo lectura (`vtm:Clan`, `vtm:Discipline`) en `vocabulary.ttl` |
| Generación, hambre, potencia de sangre, humanidad | Propiedades enteras; hambre y humanidad con editor de puntos |
| Sire / chiquillo | `vtm:sire`; `vtm:childe` y la generación ausente se deducen por reglas |
| Disciplinas de un personaje | Hecho cualificado `vtm:DisciplineRating` (disciplina + puntos) |
| Vínculo de sangre | `vtm:BloodBond` ⊑ `rpg:Relationship` con nivel 1–3 (origen = siervo, destino = regnante) |
| Favores (prestación) | `vtm:Boon` ⊑ `rpg:Relationship` con peso (trivial… de vida) |
| Convicciones y piedras de toque | `vtm:Conviction` (texto + mortal); `vtm:touchstoneOf` se deduce |
| Sectas, cargos, depredadores | Esquemas SKOS |
| Dominios, refugios, Elíseo | `vtm:Domain`, `vtm:Haven` ⊑ `rpg:Place`; `vtm:isElysium` en cualquier lugar |

La campaña de ejemplo «Noches de Madrid» (`examples/noches-de-madrid`) está enlazada con
Wikidata mediante `rpg:correspondsTo` / `rpg:inspiredBy` (nunca `owl:sameAs`).

## Derechos

Módulo **no oficial** creado por aficionados. No contiene texto de los manuales: las
descripciones son resúmenes mínimos con palabras propias, pensados para que completes
los detalles con tus libros. *Vampire: The Masquerade* y los nombres asociados son marcas
de Paradox Interactive AB.
