/**
 * Datos capturados de la API real (`loregraph seed`, campaña «noches-de-madrid»).
 * No editar a mano: ampliar o derivar casos en `fixtures.ts`.
 */
import type { InfoCampana, PropuestaDetalle, PropuestaResumen } from '@/api/hooks'
import type { Schemas } from '@/api/client'

export const rawInfoCampana: InfoCampana = {
  "campana": {
    "id": "noches-de-madrid",
    "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid",
    "nombre": "Noches de Madrid",
    "descripcion": "Crónica de ejemplo ambientada en el Madrid actual. Una coterie recién presentada ante el Príncipe investiga la destrucción del antiguo Sheriff mientras la Camarilla y los anarquistas de Lavapiés se disputan la ciudad y una sociedad de cazadores estrecha el cerco.",
    "modulos": [
      "vtm5"
    ],
    "sistema": "Vampiro: La Mascarada 5.ª ed.",
    "creada": "2026-10-13T12:55:26Z",
    "numEntidades": 54
  },
  "tipos": [
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#PlayerCharacter",
        "clave": "rpg:PlayerCharacter",
        "etiqueta": "Personaje jugador"
      },
      "descripcion": "Personaje controlado por un jugador.",
      "modulo": "core",
      "recuento": 4,
      "estilo": {
        "color": "#2563eb",
        "forma": "ellipse",
        "icono": "user-round"
      },
      "variantes": [
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Ghoul",
          "clave": "vtm:Ghoul",
          "etiqueta": "Ghoul"
        },
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Mortal",
          "clave": "vtm:Mortal",
          "etiqueta": "Mortal"
        },
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Vampire",
          "clave": "vtm:Vampire",
          "etiqueta": "Vástago"
        }
      ]
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": "Personaje no jugador, controlado por quien dirige la partida.",
      "modulo": "core",
      "recuento": 13,
      "estilo": {
        "color": "#7c3aed",
        "forma": "ellipse",
        "icono": "users-round"
      },
      "variantes": [
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Ghoul",
          "clave": "vtm:Ghoul",
          "etiqueta": "Ghoul"
        },
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Mortal",
          "clave": "vtm:Mortal",
          "etiqueta": "Mortal"
        },
        {
          "iri": "https://rpg-modules.example.net/vtm5/ont#Vampire",
          "clave": "vtm:Vampire",
          "etiqueta": "Vástago"
        }
      ]
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Place",
        "clave": "rpg:Place",
        "etiqueta": "Lugar"
      },
      "descripcion": "Ubicación del mundo de ficción, de cualquier escala: de un continente a una habitación.",
      "modulo": "core",
      "recuento": 15,
      "estilo": {
        "color": "#059669",
        "forma": "round-rectangle",
        "icono": "map-pin"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Faction",
        "clave": "rpg:Faction",
        "etiqueta": "Facción"
      },
      "descripcion": "Grupo organizado con intereses propios: gremio, secta, familia, gobierno.",
      "modulo": "core",
      "recuento": 6,
      "estilo": {
        "color": "#d97706",
        "forma": "hexagon",
        "icono": "shield"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Item",
        "clave": "rpg:Item",
        "etiqueta": "Objeto"
      },
      "descripcion": "Cosa material o artefacto relevante para la historia.",
      "modulo": "core",
      "recuento": 3,
      "estilo": {
        "color": "#0891b2",
        "forma": "diamond",
        "icono": "gem"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Event",
        "clave": "rpg:Event",
        "etiqueta": "Evento"
      },
      "descripcion": "Suceso dentro del mundo de ficción.",
      "modulo": "core",
      "recuento": 3,
      "estilo": {
        "color": "#dc2626",
        "forma": "star",
        "icono": "zap"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Session",
        "clave": "rpg:Session",
        "etiqueta": "Sesión"
      },
      "descripcion": "Sesión de juego real. Ordena el tiempo de la campaña y sirve de referencia para la vigencia de los hechos.",
      "modulo": "core",
      "recuento": 3,
      "estilo": {
        "color": "#64748b",
        "forma": "tag",
        "icono": "calendar-days"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Plot",
        "clave": "rpg:Plot",
        "etiqueta": "Trama"
      },
      "descripcion": "Hilo argumental. Su estado (abierta, resuelta, abandonada) se indica con rpg:plotStatus.",
      "modulo": "core",
      "recuento": 3,
      "estilo": {
        "color": "#db2777",
        "forma": "triangle",
        "icono": "scroll-text"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://loregraph.example.org/ont/core#Player",
        "clave": "rpg:Player",
        "etiqueta": "Jugador"
      },
      "descripcion": "Persona real que participa en la campaña. No es parte del mundo de ficción.",
      "modulo": "core",
      "recuento": 4,
      "estilo": {
        "color": "#475569",
        "forma": "round-rectangle",
        "icono": "gamepad-2"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://rpg-modules.example.net/vtm5/ont#Domain",
        "clave": "vtm:Domain",
        "etiqueta": "Dominio"
      },
      "descripcion": "Territorio reclamado por un vástago o una facción: quién puede cazar en él y bajo qué normas.",
      "modulo": "vtm5",
      "recuento": 4,
      "estilo": {
        "color": "#15803d",
        "forma": "round-rectangle",
        "icono": "map"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://rpg-modules.example.net/vtm5/ont#Clan",
        "clave": "vtm:Clan",
        "etiqueta": "Clan"
      },
      "descripcion": "Linaje de vástagos con disciplinas afines, una maldición y una compulsión propias.",
      "modulo": "vtm5",
      "recuento": 16,
      "estilo": {
        "color": "#7e22ce",
        "forma": "octagon",
        "icono": "crown"
      },
      "variantes": []
    },
    {
      "clase": {
        "iri": "https://rpg-modules.example.net/vtm5/ont#Discipline",
        "clave": "vtm:Discipline",
        "etiqueta": "Disciplina"
      },
      "descripcion": "Poder sobrenatural alimentado por la sangre, que se mide en puntos.",
      "modulo": "vtm5",
      "recuento": 12,
      "estilo": {
        "color": "#be185d",
        "forma": "vee",
        "icono": "sparkles"
      },
      "variantes": []
    }
  ],
  "relaciones": [
    {
      "clave": "rpg:memberOf",
      "iri": "https://loregraph.example.org/ont/core#memberOf",
      "etiqueta": "miembro de",
      "estilo": {
        "color": "#d97706",
        "linea": "solid",
        "ancho": null
      }
    },
    {
      "clave": "rpg:locatedIn",
      "iri": "https://loregraph.example.org/ont/core#locatedIn",
      "etiqueta": "ubicado en",
      "estilo": {
        "color": "#059669",
        "linea": "dashed",
        "ancho": null
      }
    },
    {
      "clave": "rpg:knows",
      "iri": "https://loregraph.example.org/ont/core#knows",
      "etiqueta": "conoce a",
      "estilo": {
        "color": "#94a3b8",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "rpg:possesses",
      "iri": "https://loregraph.example.org/ont/core#possesses",
      "etiqueta": "posee",
      "estilo": {
        "color": "#0891b2",
        "linea": "solid",
        "ancho": null
      }
    },
    {
      "clave": "rpg:participatesIn",
      "iri": "https://loregraph.example.org/ont/core#participatesIn",
      "etiqueta": "participa en",
      "estilo": {
        "color": "#dc2626",
        "linea": "dashed",
        "ancho": null
      }
    },
    {
      "clave": "rpg:occursIn",
      "iri": "https://loregraph.example.org/ont/core#occursIn",
      "etiqueta": "ocurre en",
      "estilo": {
        "color": "#059669",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "rpg:involves",
      "iri": "https://loregraph.example.org/ont/core#involves",
      "etiqueta": "implica a",
      "estilo": {
        "color": "#db2777",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "rpg:playedBy",
      "iri": "https://loregraph.example.org/ont/core#playedBy",
      "etiqueta": "jugado por",
      "estilo": {
        "color": "#475569",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "rpg:rel-ally",
      "iri": "https://loregraph.example.org/ont/core#rel-ally",
      "etiqueta": "aliado",
      "estilo": {
        "color": "#16a34a",
        "linea": "solid",
        "ancho": 2.0
      }
    },
    {
      "clave": "rpg:rel-friend",
      "iri": "https://loregraph.example.org/ont/core#rel-friend",
      "etiqueta": "amistad",
      "estilo": {
        "color": "#22c55e",
        "linea": "solid",
        "ancho": null
      }
    },
    {
      "clave": "rpg:rel-family",
      "iri": "https://loregraph.example.org/ont/core#rel-family",
      "etiqueta": "familia",
      "estilo": {
        "color": "#a16207",
        "linea": "solid",
        "ancho": 2.0
      }
    },
    {
      "clave": "rpg:rel-lover",
      "iri": "https://loregraph.example.org/ont/core#rel-lover",
      "etiqueta": "amante",
      "estilo": {
        "color": "#e11d48",
        "linea": "solid",
        "ancho": 2.0
      }
    },
    {
      "clave": "rpg:rel-rival",
      "iri": "https://loregraph.example.org/ont/core#rel-rival",
      "etiqueta": "rival",
      "estilo": {
        "color": "#f97316",
        "linea": "dashed",
        "ancho": null
      }
    },
    {
      "clave": "rpg:rel-enemy",
      "iri": "https://loregraph.example.org/ont/core#rel-enemy",
      "etiqueta": "enemigo",
      "estilo": {
        "color": "#b91c1c",
        "linea": "solid",
        "ancho": 3.0
      }
    },
    {
      "clave": "rpg:rel-debt",
      "iri": "https://loregraph.example.org/ont/core#rel-debt",
      "etiqueta": "deuda",
      "estilo": {
        "color": "#ca8a04",
        "linea": "dashed",
        "ancho": null
      }
    },
    {
      "clave": "rpg:rel-employer",
      "iri": "https://loregraph.example.org/ont/core#rel-employer",
      "etiqueta": "trabaja para",
      "estilo": {
        "color": "#0f766e",
        "linea": "solid",
        "ancho": null
      }
    },
    {
      "clave": "rpg:rel-mentor",
      "iri": "https://loregraph.example.org/ont/core#rel-mentor",
      "etiqueta": "mentor de",
      "estilo": {
        "color": "#4f46e5",
        "linea": "solid",
        "ancho": null
      }
    },
    {
      "clave": "vtm:sire",
      "iri": "https://rpg-modules.example.net/vtm5/ont#sire",
      "etiqueta": "sire",
      "estilo": {
        "color": "#7f1d1d",
        "linea": "solid",
        "ancho": 3.0
      }
    },
    {
      "clave": "vtm:clan",
      "iri": "https://rpg-modules.example.net/vtm5/ont#clan",
      "etiqueta": "clan",
      "estilo": {
        "color": "#7e22ce",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "vtm:domitor",
      "iri": "https://rpg-modules.example.net/vtm5/ont#domitor",
      "etiqueta": "dómitor",
      "estilo": {
        "color": "#c2410c",
        "linea": "solid",
        "ancho": 2.0
      }
    },
    {
      "clave": "vtm:haven",
      "iri": "https://rpg-modules.example.net/vtm5/ont#haven",
      "etiqueta": "refugio",
      "estilo": {
        "color": "#4d7c0f",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "vtm:domainHolder",
      "iri": "https://rpg-modules.example.net/vtm5/ont#domainHolder",
      "etiqueta": "titular del dominio",
      "estilo": {
        "color": "#15803d",
        "linea": "solid",
        "ancho": 2.0
      }
    },
    {
      "clave": "vtm:rel-blood-bond",
      "iri": "https://rpg-modules.example.net/vtm5/ont#rel-blood-bond",
      "etiqueta": "vínculo de sangre",
      "estilo": {
        "color": "#dc2626",
        "linea": "dashed",
        "ancho": 3.0
      }
    },
    {
      "clave": "vtm:rel-boon",
      "iri": "https://rpg-modules.example.net/vtm5/ont#rel-boon",
      "etiqueta": "debe un favor a",
      "estilo": {
        "color": "#ca8a04",
        "linea": "dashed",
        "ancho": 2.0
      }
    },
    {
      "clave": "vtm:rel-herd",
      "iri": "https://rpg-modules.example.net/vtm5/ont#rel-herd",
      "etiqueta": "se alimenta de",
      "estilo": {
        "color": "#9f1239",
        "linea": "dotted",
        "ancho": null
      }
    },
    {
      "clave": "vtm:rel-prestation-rival",
      "iri": "https://rpg-modules.example.net/vtm5/ont#rel-prestation-rival",
      "etiqueta": "rival en el Elíseo",
      "estilo": {
        "color": "#f97316",
        "linea": "dashed",
        "ancho": null
      }
    }
  ],
  "prefijos": {
    "rpg": "https://loregraph.example.org/ont/core#",
    "rpgsh": "https://loregraph.example.org/ont/core/shapes#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "schema": "https://schema.org/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "prov": "http://www.w3.org/ns/prov#",
    "time": "http://www.w3.org/2006/time#",
    "sh": "http://www.w3.org/ns/shacl#",
    "dash": "http://datashapes.org/dash#",
    "dcterms": "http://purl.org/dc/terms/",
    "wd": "http://www.wikidata.org/entity/",
    "wdt": "http://www.wikidata.org/prop/direct/",
    "vtm": "https://rpg-modules.example.net/vtm5/ont#",
    "vtmsh": "https://rpg-modules.example.net/vtm5/shapes#"
  },
  "tema": {
    "modulo": "vtm5",
    "tema": {
      "claro": {
        "background": "#f6f1ea",
        "foreground": "#1c1012",
        "card": "#fbf8f3",
        "card-foreground": "#1c1012",
        "popover": "#fbf8f3",
        "popover-foreground": "#1c1012",
        "primary": "#8b0a1a",
        "primary-foreground": "#fdf2f2",
        "secondary": "#ece3d8",
        "secondary-foreground": "#3b1a1f",
        "muted": "#ece3d8",
        "muted-foreground": "#6b5457",
        "accent": "#f1dcdc",
        "accent-foreground": "#5c0a14",
        "destructive": "#b91c1c",
        "destructive-foreground": "#ffffff",
        "border": "#dccfc2",
        "input": "#d4c4b5",
        "ring": "#8b0a1a",
        "sidebar": "#1a0b0e",
        "sidebar-foreground": "#f1e4e4"
      },
      "oscuro": {
        "background": "#0b0708",
        "foreground": "#eadede",
        "card": "#140c0e",
        "card-foreground": "#eadede",
        "popover": "#140c0e",
        "popover-foreground": "#eadede",
        "primary": "#c1121f",
        "primary-foreground": "#fff5f5",
        "secondary": "#24151a",
        "secondary-foreground": "#eadede",
        "muted": "#1d1215",
        "muted-foreground": "#a68f93",
        "accent": "#3a1219",
        "accent-foreground": "#ffe4e6",
        "destructive": "#ef4444",
        "destructive-foreground": "#ffffff",
        "border": "#2e1a1f",
        "input": "#3a2228",
        "ring": "#c1121f",
        "sidebar": "#070405",
        "sidebar-foreground": "#e8d6d8"
      },
      "fuentes": {
        "titulos": "'Cinzel', 'Cormorant Garamond', 'Times New Roman', serif",
        "texto": "'EB Garamond', Georgia, 'Times New Roman', serif",
        "archivos": [],
        "google": [
          "Cinzel:wght@400;600;700",
          "EB+Garamond:ital,wght@0,400;0,600;1,400"
        ]
      },
      "radio": "0.125rem"
    },
    "urlBaseAssets": "/modulos/vtm5/assets/"
  }
}

export const rawPropuestasPendientes: PropuestaResumen[] = [
  {
    "id": "4aa95d7d32",
    "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/proposal/4aa95d7d32",
    "estado": "pendiente",
    "agente": "local:qwen3:8b",
    "tipoAgente": "agente",
    "peticion": "Añade a lo que sabe Lucía el rumor de que el padre Larra tiene un informante dentro de la Camarilla.",
    "resumen": "Rumor en el conocimiento de Lucía: Larra conoce a Bruno Calvo.",
    "destino": "conocimiento/lucia-vega",
    "creada": "2026-10-13T12:55:26Z",
    "revisada": null,
    "notaRevision": null,
    "numAnadidas": 1,
    "numEliminadas": 0,
    "entidades": [
      {
        "id": "ignacio-larra",
        "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
        "etiqueta": "Padre Ignacio Larra",
        "tipo": {
          "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
          "clave": "rpg:NonPlayerCharacter",
          "etiqueta": "PNJ"
        },
        "descripcion": null,
        "editable": true,
        "modificada": null
      }
    ]
  },
  {
    "id": "7117244baf",
    "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/proposal/7117244baf",
    "estado": "pendiente",
    "agente": "mcp:claude-code",
    "tipoAgente": "agente",
    "peticion": "Crea un PNJ Nosferatu que vigile los túneles de la estación fantasma y conozca a Núria.",
    "resumen": "Nuevo PNJ Nosferatu, guardián de los túneles, aliado ambiguo de Núria.",
    "destino": "canon",
    "creada": "2026-10-13T12:55:26Z",
    "revisada": null,
    "notaRevision": null,
    "numAnadidas": 22,
    "numEliminadas": 0,
    "entidades": [
      {
        "id": "remedios-ortiz-la-topo-a1fa",
        "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "tipo": {
          "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
          "clave": "rpg:NonPlayerCharacter",
          "etiqueta": "PNJ"
        },
        "descripcion": null,
        "editable": true,
        "modificada": null
      }
    ]
  }
]

export const rawPropuestaAprobada: PropuestaResumen = {
  "id": "4aa95d7d32",
  "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/proposal/4aa95d7d32",
  "estado": "aprobada",
  "agente": "local:qwen3:8b",
  "tipoAgente": "agente",
  "peticion": "Añade a lo que sabe Lucía el rumor de que el padre Larra tiene un informante dentro de la Camarilla.",
  "resumen": "Rumor en el conocimiento de Lucía: Larra conoce a Bruno Calvo.",
  "destino": "conocimiento/lucia-vega",
  "creada": "2026-10-13T12:55:26Z",
  "revisada": "2026-10-13T12:56:09Z",
  "notaRevision": "x",
  "numAnadidas": 1,
  "numEliminadas": 0,
  "entidades": [
    {
      "id": "ignacio-larra",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
      "etiqueta": "Padre Ignacio Larra",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": null
    }
  ]
}

export const rawDetalleNuevoPnj: PropuestaDetalle = {
  "id": "7117244baf",
  "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/proposal/7117244baf",
  "estado": "pendiente",
  "agente": "mcp:claude-code",
  "tipoAgente": "agente",
  "peticion": "Crea un PNJ Nosferatu que vigile los túneles de la estación fantasma y conozca a Núria.",
  "resumen": "Nuevo PNJ Nosferatu, guardián de los túneles, aliado ambiguo de Núria.",
  "destino": "canon",
  "creada": "2026-10-13T12:55:26Z",
  "revisada": null,
  "notaRevision": null,
  "numAnadidas": 22,
  "numEliminadas": 0,
  "entidades": [
    {
      "id": "remedios-ortiz-la-topo-a1fa",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "etiqueta": "Remedios Ortiz «la Topo»",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": null
    }
  ],
  "anadidas": [
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
        "etiqueta": "46190b99",
        "id": "remedios-ortiz-la-topo-a1fa/n/46190b99",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "etiqueta": "tipo",
        "id": null,
        "clave": "rdf:type",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#DisciplineRating",
        "etiqueta": "Nivel de disciplina",
        "id": null,
        "clave": "vtm:DisciplineRating",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
        "etiqueta": "46190b99",
        "id": "remedios-ortiz-la-topo-a1fa/n/46190b99",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#source",
        "etiqueta": "origen",
        "id": null,
        "clave": "rpg:source",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
        "etiqueta": "46190b99",
        "id": "remedios-ortiz-la-topo-a1fa/n/46190b99",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#discipline",
        "etiqueta": "disciplina",
        "id": null,
        "clave": "vtm:discipline",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#discipline-animalism",
        "etiqueta": "Animalismo",
        "id": null,
        "clave": "vtm:discipline-animalism",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
        "etiqueta": "46190b99",
        "id": "remedios-ortiz-la-topo-a1fa/n/46190b99",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#dots",
        "etiqueta": "puntos",
        "id": null,
        "clave": "vtm:dots",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "literal",
        "valor": "2",
        "etiqueta": "2",
        "id": null,
        "clave": null,
        "datatype": "http://www.w3.org/2001/XMLSchema#integer",
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "etiqueta": "b1a86ef2",
        "id": "remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "etiqueta": "tipo",
        "id": null,
        "clave": "rdf:type",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#DisciplineRating",
        "etiqueta": "Nivel de disciplina",
        "id": null,
        "clave": "vtm:DisciplineRating",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "etiqueta": "b1a86ef2",
        "id": "remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#source",
        "etiqueta": "origen",
        "id": null,
        "clave": "rpg:source",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "etiqueta": "b1a86ef2",
        "id": "remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#discipline",
        "etiqueta": "disciplina",
        "id": null,
        "clave": "vtm:discipline",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#discipline-obfuscate",
        "etiqueta": "Ofuscación",
        "id": null,
        "clave": "vtm:discipline-obfuscate",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "etiqueta": "b1a86ef2",
        "id": "remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#dots",
        "etiqueta": "puntos",
        "id": null,
        "clave": "vtm:dots",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "literal",
        "valor": "4",
        "etiqueta": "4",
        "id": null,
        "clave": null,
        "datatype": "http://www.w3.org/2001/XMLSchema#integer",
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "etiqueta": "tipo",
        "id": null,
        "clave": "rdf:type",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#Vampire",
        "etiqueta": "Vástago",
        "id": null,
        "clave": "vtm:Vampire",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "etiqueta": "tipo",
        "id": null,
        "clave": "rdf:type",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "etiqueta": "PNJ",
        "id": null,
        "clave": "rpg:NonPlayerCharacter",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "http://www.w3.org/2000/01/rdf-schema#label",
        "etiqueta": "nombre",
        "id": null,
        "clave": "rdfs:label",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "literal",
        "valor": "Remedios Ortiz «la Topo»",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": null,
        "clave": null,
        "datatype": "http://www.w3.org/2001/XMLSchema#string",
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#knows",
        "etiqueta": "conoce a",
        "id": null,
        "clave": "rpg:knows",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/nuria-sanz",
        "etiqueta": "Núria Sanz",
        "id": "nuria-sanz",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#locatedIn",
        "etiqueta": "ubicado en",
        "id": null,
        "clave": "rpg:locatedIn",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/tuneles-chamberi",
        "etiqueta": "Túneles de la estación fantasma",
        "id": "tuneles-chamberi",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#memberOf",
        "etiqueta": "miembro de",
        "id": null,
        "clave": "rpg:memberOf",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/camarilla-madrid",
        "etiqueta": "Camarilla de Madrid",
        "id": "camarilla-madrid",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#vitalStatus",
        "etiqueta": "estado vital",
        "id": null,
        "clave": "rpg:vitalStatus",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#vital-alive",
        "etiqueta": "vivo",
        "id": null,
        "clave": "rpg:vital-alive",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#clan",
        "etiqueta": "clan",
        "id": null,
        "clave": "vtm:clan",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#clan-nosferatu",
        "etiqueta": "Nosferatu",
        "id": null,
        "clave": "vtm:clan-nosferatu",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#generation",
        "etiqueta": "generación",
        "id": null,
        "clave": "vtm:generation",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "literal",
        "valor": "10",
        "etiqueta": "10",
        "id": null,
        "clave": null,
        "datatype": "http://www.w3.org/2001/XMLSchema#integer",
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#hasDisciplineRating",
        "etiqueta": "disciplinas",
        "id": null,
        "clave": "vtm:hasDisciplineRating",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "etiqueta": "b1a86ef2",
        "id": "remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#hasDisciplineRating",
        "etiqueta": "disciplinas",
        "id": null,
        "clave": "vtm:hasDisciplineRating",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
        "etiqueta": "46190b99",
        "id": "remedios-ortiz-la-topo-a1fa/n/46190b99",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#position",
        "etiqueta": "cargo",
        "id": null,
        "clave": "vtm:position",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#position-primogen",
        "etiqueta": "Primogénito",
        "id": null,
        "clave": "vtm:position-primogen",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#sect",
        "etiqueta": "secta",
        "id": null,
        "clave": "vtm:sect",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://rpg-modules.example.net/vtm5/ont#sect-camarilla",
        "etiqueta": "Camarilla",
        "id": null,
        "clave": "vtm:sect-camarilla",
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    },
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
        "etiqueta": "Remedios Ortiz «la Topo»",
        "id": "remedios-ortiz-la-topo-a1fa",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://schema.org/description",
        "etiqueta": "descripción",
        "id": null,
        "clave": "schema:description",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "literal",
        "valor": "Nosferatu anciana que cobra peaje en los túneles del antiguo metro. Nadie pasa sin contarle un secreto.",
        "etiqueta": "Nosferatu anciana que cobra peaje en los túneles del antiguo metro. Nadie pasa sin contarle un secreto.",
        "id": null,
        "clave": null,
        "datatype": "http://www.w3.org/2001/XMLSchema#string",
        "idioma": null
      },
      "grafo": null
    }
  ],
  "eliminadas": [],
  "errores": []
}

export const rawDetalleConocimiento: PropuestaDetalle = {
  "id": "4aa95d7d32",
  "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/proposal/4aa95d7d32",
  "estado": "pendiente",
  "agente": "local:qwen3:8b",
  "tipoAgente": "agente",
  "peticion": "Añade a lo que sabe Lucía el rumor de que el padre Larra tiene un informante dentro de la Camarilla.",
  "resumen": "Rumor en el conocimiento de Lucía: Larra conoce a Bruno Calvo.",
  "destino": "conocimiento/lucia-vega",
  "creada": "2026-10-13T12:55:26Z",
  "revisada": null,
  "notaRevision": null,
  "numAnadidas": 1,
  "numEliminadas": 0,
  "entidades": [
    {
      "id": "ignacio-larra",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
      "etiqueta": "Padre Ignacio Larra",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": null
    }
  ],
  "anadidas": [
    {
      "sujeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
        "etiqueta": "Padre Ignacio Larra",
        "id": "ignacio-larra",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "predicado": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/ont/core#knows",
        "etiqueta": "conoce a",
        "id": null,
        "clave": "rpg:knows",
        "datatype": null,
        "idioma": null
      },
      "objeto": {
        "tipo": "iri",
        "valor": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/bruno-calvo",
        "etiqueta": "Bruno Calvo",
        "id": "bruno-calvo",
        "clave": null,
        "datatype": null,
        "idioma": null
      },
      "grafo": null
    }
  ],
  "eliminadas": [],
  "errores": []
}

export const rawEditableNuevoPnj: Schemas['PropuestaEditable'] = {
  "anadir": [
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#sect",
      "o": "https://rpg-modules.example.net/vtm5/ont#sect-camarilla",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "o": "https://rpg-modules.example.net/vtm5/ont#Vampire",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "o": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#clan",
      "o": "https://rpg-modules.example.net/vtm5/ont#clan-nosferatu",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://loregraph.example.org/ont/core#knows",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/nuria-sanz",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#position",
      "o": "https://rpg-modules.example.net/vtm5/ont#position-primogen",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://schema.org/description",
      "o": "Nosferatu anciana que cobra peaje en los túneles del antiguo metro. Nadie pasa sin contarle un secreto.",
      "literal": true,
      "datatype": "http://www.w3.org/2001/XMLSchema#string",
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#hasDisciplineRating",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#hasDisciplineRating",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://loregraph.example.org/ont/core#locatedIn",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/tuneles-chamberi",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://loregraph.example.org/ont/core#vitalStatus",
      "o": "https://loregraph.example.org/ont/core#vital-alive",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://loregraph.example.org/ont/core#memberOf",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/camarilla-madrid",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "https://rpg-modules.example.net/vtm5/ont#generation",
      "o": "10",
      "literal": true,
      "datatype": "http://www.w3.org/2001/XMLSchema#integer",
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "p": "http://www.w3.org/2000/01/rdf-schema#label",
      "o": "Remedios Ortiz «la Topo»",
      "literal": true,
      "datatype": "http://www.w3.org/2001/XMLSchema#string",
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
      "p": "https://rpg-modules.example.net/vtm5/ont#discipline",
      "o": "https://rpg-modules.example.net/vtm5/ont#discipline-obfuscate",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
      "p": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "o": "https://rpg-modules.example.net/vtm5/ont#DisciplineRating",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
      "p": "https://rpg-modules.example.net/vtm5/ont#dots",
      "o": "4",
      "literal": true,
      "datatype": "http://www.w3.org/2001/XMLSchema#integer",
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/b1a86ef2",
      "p": "https://loregraph.example.org/ont/core#source",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
      "p": "https://rpg-modules.example.net/vtm5/ont#discipline",
      "o": "https://rpg-modules.example.net/vtm5/ont#discipline-animalism",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
      "p": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "o": "https://rpg-modules.example.net/vtm5/ont#DisciplineRating",
      "literal": false,
      "datatype": null,
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
      "p": "https://rpg-modules.example.net/vtm5/ont#dots",
      "o": "2",
      "literal": true,
      "datatype": "http://www.w3.org/2001/XMLSchema#integer",
      "idioma": null
    },
    {
      "s": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa/n/46190b99",
      "p": "https://loregraph.example.org/ont/core#source",
      "o": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa",
      "literal": false,
      "datatype": null,
      "idioma": null
    }
  ],
  "eliminar": []
}

export const rawEstadoAgente: Schemas['EstadoAgente'] = {
  "proveedor": "ollama",
  "modelo": "qwen3:8b",
  "url": "http://localhost:11434/v1",
  "contexto": 8192
}

export const rawPersonajesConConocimiento: Schemas['EntidadRef'][] = [
  {
    "id": "lucia-vega",
    "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/lucia-vega",
    "etiqueta": "Lucía Vega",
    "tipo": {
      "iri": "https://loregraph.example.org/ont/core#PlayerCharacter",
      "clave": "rpg:PlayerCharacter",
      "etiqueta": "Personaje jugador"
    },
    "descripcion": null,
    "editable": true,
    "modificada": null
  }
]

export const rawError422: Schemas['ErrorRespuesta'] = {
  "detalle": "Los datos no son válidos",
  "errores": [
    {
      "foco": "https://dbpedia.org/resource/Madrid",
      "focoId": null,
      "campo": "rpg:knows",
      "mensaje": "Solo se pueden afirmar hechos sobre entidades de esta campaña (nunca sobre recursos reales u ontologías)",
      "severidad": "violacion",
      "valor": null
    }
  ]
}

export const rawError502: Schemas['ErrorRespuesta'] = {
  "detalle": "El modelo no está disponible o falló: Connection error.",
  "errores": []
}

export const rawResultadoLoteFallido: Schemas['ResultadoLote'] = {
  "aprobadas": [],
  "fallidas": {
    "noexiste": [
      {
        "foco": null,
        "focoId": null,
        "campo": null,
        "mensaje": "No existe la propuesta 'noexiste'",
        "severidad": "violacion",
        "valor": null
      }
    ]
  }
}

export const rawPanel: Schemas['PanelCampana'] = {
  "campana": {
    "id": "noches-de-madrid",
    "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid",
    "nombre": "Noches de Madrid",
    "descripcion": "Crónica de ejemplo ambientada en el Madrid actual. Una coterie recién presentada ante el Príncipe investiga la destrucción del antiguo Sheriff mientras la Camarilla y los anarquistas de Lavapiés se disputan la ciudad y una sociedad de cazadores estrecha el cerco.",
    "modulos": [
      "vtm5"
    ],
    "sistema": "Vampiro: La Mascarada 5.ª ed.",
    "creada": "2026-10-13T12:55:26Z",
    "numEntidades": 54
  },
  "recuentos": {
    "rpg:PlayerCharacter": 4,
    "rpg:NonPlayerCharacter": 13,
    "rpg:Place": 15,
    "rpg:Faction": 6,
    "rpg:Item": 3,
    "rpg:Event": 3,
    "rpg:Session": 3,
    "rpg:Plot": 3,
    "rpg:Player": 4,
    "vtm:Domain": 4,
    "vtm:Clan": 16,
    "vtm:Discipline": 12
  },
  "recientes": [
    {
      "id": "ignacio-larra",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
      "etiqueta": "Padre Ignacio Larra",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896169.8935611
    },
    {
      "id": "lucia-vega",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/lucia-vega",
      "etiqueta": "Lucía Vega",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#PlayerCharacter",
        "clave": "rpg:PlayerCharacter",
        "etiqueta": "Personaje jugador"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.2893984
    },
    {
      "id": "aurelio-benavente",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/aurelio-benavente",
      "etiqueta": "Aurelio Benavente",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.285888
    },
    {
      "id": "hugo-pena",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/hugo-pena",
      "etiqueta": "Hugo Peña",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
        "clave": "rpg:NonPlayerCharacter",
        "etiqueta": "PNJ"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.2848897
    },
    {
      "id": "gran-via",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/gran-via",
      "etiqueta": "Dominio de la Gran Vía",
      "tipo": {
        "iri": "https://rpg-modules.example.net/vtm5/ont#Domain",
        "clave": "vtm:Domain",
        "etiqueta": "Dominio"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.283891
    },
    {
      "id": "javi",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/javi",
      "etiqueta": "Javi",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#Player",
        "clave": "rpg:Player",
        "etiqueta": "Jugador"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.2813838
    },
    {
      "id": "llave-capilla",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/llave-capilla",
      "etiqueta": "Llave de bronce de la capilla",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#Item",
        "clave": "rpg:Item",
        "etiqueta": "Objeto"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.2792642
    },
    {
      "id": "carta-sordo",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/carta-sordo",
      "etiqueta": "Carta lacrada del Sordo",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#Item",
        "clave": "rpg:Item",
        "etiqueta": "Objeto"
      },
      "descripcion": null,
      "editable": true,
      "modificada": 1791896126.278259
    }
  ],
  "tramasAbiertas": [
    {
      "entidad": {
        "id": "trama-cuaderno",
        "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/trama-cuaderno",
        "etiqueta": "El cuaderno perdido del Sordo",
        "tipo": {
          "iri": "https://loregraph.example.org/ont/core#Plot",
          "clave": "rpg:Plot",
          "etiqueta": "Trama"
        },
        "descripcion": "El Sordo pide recuperar su cuaderno antes de que lo encuentre la capilla Tremere.",
        "editable": true,
        "modificada": null
      },
      "implicados": [
        {
          "id": "aurelio-benavente",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/aurelio-benavente",
          "etiqueta": "Aurelio Benavente",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
            "clave": "rpg:NonPlayerCharacter",
            "etiqueta": "PNJ"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "teo-almagro",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/teo-almagro",
          "etiqueta": "Teo Almagro",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#PlayerCharacter",
            "clave": "rpg:PlayerCharacter",
            "etiqueta": "Personaje jugador"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "cuaderno-sordo",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/cuaderno-sordo",
          "etiqueta": "Cuaderno de la Quinta",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#Item",
            "clave": "rpg:Item",
            "etiqueta": "Objeto"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "el-sordo",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/el-sordo",
          "etiqueta": "El Sordo",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
            "clave": "rpg:NonPlayerCharacter",
            "etiqueta": "PNJ"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        }
      ]
    },
    {
      "entidad": {
        "id": "trama-ferrer",
        "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/trama-ferrer",
        "etiqueta": "¿Quién destruyó a Gonzalo Ferrer?",
        "tipo": {
          "iri": "https://loregraph.example.org/ont/core#Plot",
          "clave": "rpg:Plot",
          "etiqueta": "Trama"
        },
        "descripcion": "El Príncipe quiere un culpable; los anarquistas, que no sea uno de los suyos.",
        "editable": true,
        "modificada": null
      },
      "implicados": [
        {
          "id": "gonzalo-ferrer",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/gonzalo-ferrer",
          "etiqueta": "Gonzalo Ferrer",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
            "clave": "rpg:NonPlayerCharacter",
            "etiqueta": "PNJ"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "muerte-ferrer",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/muerte-ferrer",
          "etiqueta": "Muerte Definitiva de Gonzalo Ferrer",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#Event",
            "clave": "rpg:Event",
            "etiqueta": "Evento"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "ignacio-larra",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/ignacio-larra",
          "etiqueta": "Padre Ignacio Larra",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
            "clave": "rpg:NonPlayerCharacter",
            "etiqueta": "PNJ"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "retiro",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/retiro",
          "etiqueta": "Dominio del Retiro",
          "tipo": {
            "iri": "https://rpg-modules.example.net/vtm5/ont#Domain",
            "clave": "vtm:Domain",
            "etiqueta": "Dominio"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        },
        {
          "id": "bruno-calvo",
          "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/bruno-calvo",
          "etiqueta": "Bruno Calvo",
          "tipo": {
            "iri": "https://loregraph.example.org/ont/core#NonPlayerCharacter",
            "clave": "rpg:NonPlayerCharacter",
            "etiqueta": "PNJ"
          },
          "descripcion": null,
          "editable": true,
          "modificada": null
        }
      ]
    }
  ],
  "propuestasPendientes": 1,
  "incoherencias": 0,
  "ultimaSesion": {
    "entidad": {
      "id": "sesion-3",
      "iri": "https://loregraph.example.org/data/campaign/noches-de-madrid/entity/sesion-3",
      "etiqueta": "Sesión 3: La capilla bajo el templo",
      "tipo": {
        "iri": "https://loregraph.example.org/ont/core#Session",
        "clave": "rpg:Session",
        "etiqueta": "Sesión"
      },
      "descripcion": null,
      "editable": true,
      "modificada": null
    },
    "numero": 3,
    "fecha": "2026-10-03",
    "fechaMundo": "Noche del 20 de octubre",
    "notas": "El regente Benavente recibe a la coterie en la capilla tremere bajo el Templo de Debod. El Sordo habla de un cuaderno perdido. El padre Ignacio Larra identifica a Lucía y la convierte en su objetivo."
  },
  "tema": null
}
