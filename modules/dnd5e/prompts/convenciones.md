# Convenciones del módulo D&D 5.ª edición

* Ids de entidad en minúsculas con guiones (`iria`, `puerto-brasa`, `trama-ojo-basalto`).
* Cada entidad tiene exactamente un `rdfs:label` (texto sin idioma) y, como mucho, una
  `schema:description`.
* Un personaje D&D es siempre rol del núcleo + variante: `rpg:PlayerCharacter` o
  `rpg:NonPlayerCharacter`, más `dnd:Adventurer` (tiene clases) o `dnd:Creature`
  (tiene bloque de estadísticas). `dnd:Monster` es solo catálogo: no lo uses para PNJ.
* Valores derivados (no se escriben): `dnd:totalLevel`, `dnd:proficiencyBonus` y los
  modificadores `dnd:strengthModifier`… Se consultan en el grafo derivado.
* Rangos: características 1–30; niveles por clase 1–20 y total ≤ 20; VD 0–30;
  cansancio 0–6; salvaciones contra la muerte 0–3; intensidad de relación −3…+3.
* Dados de daño de armas en notación `NdM` (`1d8`, `2d6`).
* Para consultas SPARQL, las etiquetas del catálogo tienen idioma (`"Mago"@es`): filtra
  con `FILTER(lang(?l) = "es")`; las de la campaña no tienen idioma.
