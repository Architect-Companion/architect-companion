# Server Architecture

Dieses Dokument beschreibt die geplante Server-Architektur für Architect Companion. Ziel ist es, die bisher lokale CLI-Pipeline um eine zentral verwaltete Plattform zu erweitern: Profiles werden über eine Web-UI hochgeladen, in einer Datenbank persistiert und über eine API für Coding Agents abrufbar gemacht.

---

## Systemübersicht

```mermaid
graph TB
    subgraph Browser["Web UI (Browser)"]
        UI_Upload["Profile Upload\n(YAML)"]
        UI_List["Profile Library\n(Übersicht & Verwaltung)"]
        UI_Preview["Render Preview\n(Output Vorschau)"]
    end

    subgraph Server["Architect Companion Server"]
        direction TB
        subgraph API["REST API"]
            API_Profiles["/api/profiles\n(CRUD)"]
            API_Render["/api/render\n(Rendering Engine)"]
        end
        subgraph Core["Core Logic"]
            SVC_Profile["Profile Service\n(Validation & Parsing)"]
            SVC_Render["Renderer Service\n(Deterministic Rendering)"]
            SVC_Model["Effective Model Builder\n(Merge & Resolve)"]
        end
    end

    subgraph DB["Persistenz"]
        DB_Profiles[("Profile Store\n(YAML + Metadata)")]
    end

    subgraph Local["Lokaler Entwickler-Rechner"]
        direction TB
        CLI["architect-companion CLI"]
        CLI_Init["architect-companion init\n(Profil vom Server laden)"]
        CLI_Render["architect-companion render\n(Lokales Rendering)"]
        CLI_Check["architect-companion check\n(Policy Checks)"]

        subgraph Project["Projekt (lokal)"]
            Harness[".architect-companion/\nharness.yml + modules.yml"]
            Generated["Generierte Dateien\n(AGENTS.md, .cursor/, ...)"]
        end

        subgraph Tools["Lokale Dev Tools"]
            DepCruiser["dependency-cruiser"]
            GHActions["GitHub Actions"]
            Cursor["Cursor / Claude Code"]
        end
    end

    %% UI → API
    UI_Upload -->|"YAML hochladen"| API_Profiles
    UI_List -->|"Profile abrufen"| API_Profiles
    UI_Preview -->|"Render-Vorschau"| API_Render

    %% API → Core
    API_Profiles --> SVC_Profile
    API_Render --> SVC_Render
    SVC_Render --> SVC_Model
    SVC_Profile --> SVC_Model

    %% Core → DB
    SVC_Profile -->|"Persistieren"| DB_Profiles
    SVC_Model -->|"Profile laden"| DB_Profiles

    %% CLI → API
    CLI_Init -->|"GET /api/profiles/:id"| API_Profiles
    CLI_Init -->|"Profil lokal schreiben"| Harness

    %% CLI → lokale Pipeline
    CLI_Render -->|"Liest"| Harness
    CLI_Render -->|"Schreibt"| Generated
    CLI_Check -->|"Validiert"| Generated

    %% Lokale Outputs → Tools
    Generated -->|"AGENTS.md / CLAUDE.md"| Cursor
    Generated -->|".cursor/rules/"| Cursor
    Generated -->|"dependency-cruiser.config.js"| DepCruiser
    Generated -->|".github/workflows/"| GHActions
```

---

## Datenflüsse

### 1. Profile hochladen (Web UI → Server)

```mermaid
sequenceDiagram
    actor Architect
    participant UI as Web UI
    participant API as /api/profiles
    participant SVC as Profile Service
    participant DB as Profile Store

    Architect->>UI: YAML-Datei auswählen & hochladen
    UI->>API: POST /api/profiles (multipart YAML)
    API->>SVC: validateAndParse(yaml)
    SVC-->>API: ParsedProfile oder ValidationError
    alt Valides Profil
        API->>DB: INSERT profile (yaml, metadata)
        DB-->>API: profileId
        API-->>UI: 201 { id, name, version }
        UI-->>Architect: Erfolg + Profil-ID
    else Invalides Profil
        API-->>UI: 400 { errors: [...] }
        UI-->>Architect: Fehleranzeige mit Details
    end
```

### 2. Lokale Initialisierung via CLI

```mermaid
sequenceDiagram
    actor Dev as Entwickler
    participant CLI as architect-companion CLI
    participant API as Server API
    participant FS as Lokales Dateisystem

    Dev->>CLI: architect-companion init
    CLI->>Dev: Welchen Server? Welches Profil?
    Dev-->>CLI: https://ac.example.com | modular-monolith@0.1.0

    CLI->>API: GET /api/profiles?name=modular-monolith&version=0.1.0
    API-->>CLI: 200 { yaml: "...", metadata: {...} }

    CLI->>FS: .architect-companion/harness.yml schreiben
    CLI->>FS: profiles/modular-monolith/profile.yml schreiben (Cache)
    CLI-->>Dev: Initialisiert. Nächster Schritt: architect-companion render
```

### 3. Rendering via Server API (Remote Render)

```mermaid
sequenceDiagram
    actor Client as CLI / CI Pipeline
    participant API as /api/render
    participant SVC as Renderer Service
    participant Model as Effective Model Builder
    participant DB as Profile Store

    Client->>API: POST /api/render\n{ profileId, harnessConfig, moduleMetadata }
    API->>Model: buildEffectiveModel(profileId, config)
    Model->>DB: GET profile by ID
    DB-->>Model: ProfileConfig (YAML)
    Model-->>API: EffectiveHarnessModel

    API->>SVC: render(effectiveModel, targets)
    SVC-->>API: RenderResult { files: [...] }

    API-->>Client: 200 {\n  "AGENTS.md": "...",\n  ".cursor/rules/modules.mdc": "...",\n  "dependency-cruiser.config.js": "..."\n}
```

---

## Komponenten

### Web UI

| Komponente | Beschreibung |
|---|---|
| Profile Upload | Drag & Drop / Dateiauswahl für YAML-Dateien, inkl. Validierungs-Feedback |
| Profile Library | Übersicht aller gespeicherten Profile mit Name, Version, Stack |
| Render Preview | Vorschau der generierten Ausgabedateien für ein gewähltes Profil |

### Server API

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/profiles` | `GET` | Alle Profile auflisten (Name, Version, Stack) |
| `/api/profiles` | `POST` | Neues Profil hochladen (YAML, multipart) |
| `/api/profiles/:id` | `GET` | Einzelnes Profil abrufen (YAML + Metadata) |
| `/api/profiles/:id` | `DELETE` | Profil löschen |
| `/api/render` | `POST` | Effektives Modell rendern (gibt Ausgabedateien zurück) |

### CLI-Erweiterungen

| Befehl | Beschreibung |
|---|---|
| `architect-companion init` | Verbindet Projekt mit Server, lädt Profil herunter, schreibt `harness.yml` |
| `architect-companion render` | Rendert Ausgabedateien lokal (aus gecachtem oder lokalem Profil) |
| `architect-companion render --remote` | Rendering via Server-API statt lokal |
| `architect-companion check` | Policy Checks mit externen Tools (dependency-cruiser etc.) |
| `architect-companion profile sync` | Profil-Cache mit Serverversion abgleichen |

---

## Ausgabe-Formate der Render API

Die Render API gibt je nach konfigurierten Targets verschiedene Dateien zurück:

```
targets:
  agentsMd       → AGENTS.md, CLAUDE.md
  cursor         → .cursor/rules/<module>.mdc
  dependencyCruiser → .dependency-cruiser.config.js
  githubActions  → .github/workflows/architect-check.yml
```

Der Client (CLI oder CI) schreibt diese Dateien in das lokale Projektverzeichnis.

---

## Technologie-Überlegungen

```mermaid
graph LR
    subgraph Frontend
        A["React / Next.js\n(Web UI)"]
    end

    subgraph Backend
        B["Node.js + TypeScript\n(Express / Fastify)"]
        C["Shared: effective-model.ts\n(bestehende Logik wiederverwenden)"]
    end

    subgraph Storage
        D["PostgreSQL oder SQLite\n(Profile als YAML-Text + Metadaten)"]
    end

    A -->|"HTTP/REST"| B
    B --> C
    B --> D
```

Die bestehende `effective-model.ts`-Logik lässt sich direkt im Server-Backend wiederverwenden — kein Rewrite nötig. Der Server wird zum Host der bisher nur lokalen Resolver- und Renderer-Pipeline.
