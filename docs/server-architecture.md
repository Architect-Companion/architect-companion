# Zielbild: Server-Architektur

Dieses Dokument beschreibt das langfristige Zielbild von Architect Companion als Server-Plattform. Die gesamte Logik — Profile, Harness Configs, Effective Model Building und Rendering — läuft auf dem Server. Auf dem lokalen Entwickler-Rechner verbleibt ausschließlich die CLI, die dem Server ihre Projekt-ID und die lokalen Modul-Metadaten mitgibt und fertig gerenderte Dateien zurückbekommt.

---

## Systemübersicht

```mermaid
graph TB
    subgraph Browser["☁️ Web UI"]
        direction TB
        UI_Profiles["Profile verwalten\nYAML hochladen & versionieren"]
        UI_Harness["Harness Configs verwalten\nProjekt-Konfigurationen"]
        UI_Preview["Render Preview\nOutput-Vorschau je Projekt"]
    end

    subgraph Server["🖥️ Architect Companion Server"]
        direction TB
        subgraph API_Layer["REST API"]
            direction TB
            API_Profiles["/api/profiles\nCRUD für Profile"]
            API_Harnesses["/api/harnesses\nCRUD für Harness Configs"]
            API_Render["/api/render\nRendering-Endpunkt"]
        end
        subgraph Core_Layer["Core"]
            direction TB
            SVC_Profile["Profile Service\nValidierung & Parsing"]
            SVC_Harness["Harness Service\nProjekt-Konfigurationen"]
            SVC_Model["Effective Model Builder\nMerge: Profile + Harness + Module"]
            SVC_Render["Renderer Service\nDeterministisches Rendering"]
        end
        DB[("Datenbank\nProfile · Harness Configs · Metadaten")]
    end

    subgraph Local["💻 Lokaler Entwickler-Rechner"]
        direction TB
        CLI["architect-companion CLI\nnur HTTP-Client + Datei-Schreiber"]
        Modules["modules.yml\nModul-Struktur des lokalen Projekts"]
        Files["Generierte Projekt-Dateien\nAGENTS.md · CLAUDE.md\n.cursor/rules/ · .github/workflows/"]
    end

    UI_Profiles -->|"YAML hochladen"| API_Profiles
    UI_Harness -->|"Harness verwalten"| API_Harnesses
    UI_Preview -->|"Render anfragen"| API_Render

    API_Profiles --> SVC_Profile
    SVC_Profile --> DB

    API_Harnesses --> SVC_Harness
    SVC_Harness --> DB

    API_Render --> SVC_Model
    SVC_Model -->|"Profil laden"| DB
    SVC_Model -->|"Harness Config laden"| DB
    SVC_Model --> SVC_Render

    CLI -->|"project-id + modules.yml"| API_Render
    Modules -->|"lokal gelesen"| CLI
    API_Render -->|"Gerenderte Dateien"| CLI
    CLI -->|"Dateien schreiben"| Files
```

---

## Datenbank-Schema

```mermaid
graph TB
    subgraph DB["Datenbank"]
        direction TB
        T_Profiles["profiles\n─────────────────\nid · name · version\nyaml_content · created_at"]
        T_Harnesses["harness_configs\n─────────────────\nid · project_id (slug)\nprofile_id (FK) · targets\ncreated_at · updated_at"]
    end

    T_Harnesses -->|"referenziert"| T_Profiles
```

Ein Harness Config ist die Server-seitige Entsprechung der bisherigen `harness.yml`: Sie verknüpft ein Projekt (per `project_id`-Slug) mit einem Profil und definiert die aktiven Targets. `modules.yml` bleibt lokal, da sie die tatsächliche Code-Struktur des Projekts beschreibt.

---

## Datenfluss 1: Profil hochladen

```mermaid
sequenceDiagram
    actor A as Architect
    participant UI as Web UI
    participant API as /api/profiles
    participant SVC as Profile Service
    participant DB as Datenbank

    A->>UI: YAML-Datei auswählen & hochladen
    UI->>API: POST /api/profiles
    API->>SVC: validate(yaml)
    alt Valide
        SVC->>DB: Profil speichern
        DB-->>SVC: profileId
        API-->>UI: 201 { id, name, version }
        UI-->>A: Erfolg + Profil-ID
    else Invalide
        API-->>UI: 400 { errors }
        UI-->>A: Fehlerdetails
    end
```

---

## Datenfluss 2: Harness Config anlegen

```mermaid
sequenceDiagram
    actor A as Architect
    participant UI as Web UI
    participant API as /api/harnesses
    participant SVC as Harness Service
    participant DB as Datenbank

    A->>UI: Projekt-ID eingeben, Profil wählen, Targets konfigurieren
    UI->>API: POST /api/harnesses\n{ projectId, profileId, targets }
    API->>SVC: validate(config)
    SVC->>DB: Harness Config speichern
    DB-->>SVC: harnessId
    API-->>UI: 201 { id, projectId, profileId }
    UI-->>A: Gespeichert
```

---

## Datenfluss 3: CLI rendert Dateien

```mermaid
sequenceDiagram
    actor Dev as Entwickler
    participant CLI as architect-companion CLI
    participant FS as Lokales Projekt
    participant API as Server /api/render

    Dev->>CLI: architect-companion init [--project my-app]
    CLI->>FS: modules.yml lesen
    CLI->>API: POST /api/render\n{ projectId: "my-app", moduleMetadata }

    Note over API: Kein projectId → Default-Harness\nMit projectId → projektspezifischer Harness

    API->>API: Harness Config aus DB laden\n(oder Default-Harness)
    API->>API: Profil aus DB laden
    API->>API: Effective Model bauen
    API->>API: Rendern
    API-->>CLI: 200 { "AGENTS.md": "...", ".cursor/rules/...": "..." }

    CLI->>FS: AGENTS.md schreiben
    CLI->>FS: CLAUDE.md schreiben
    CLI->>FS: .cursor/rules/*.mdc schreiben
    CLI->>FS: .github/workflows/architect-check.yml schreiben

    CLI-->>Dev: Fertig. Alle Dateien aktualisiert.
```

---

## Render-Outputs der API

Je nach konfigurierten Targets im Harness Config liefert die Render API verschiedene Dateien zurück:

| Target | Generierte Datei(en) |
|---|---|
| `agentsMd` | `AGENTS.md`, `CLAUDE.md` |
| `cursor` | `.cursor/rules/<modul>.mdc` |
| `dependencyCruiser` | `.dependency-cruiser.config.js` |
| `githubActions` | `.github/workflows/architect-check.yml` |

---

## CLI-Befehle (Zielbild)

| Befehl | Beschreibung |
|---|---|
| `architect-companion init` | Rendert mit Default-Harness, schreibt alle Dateien ins Projekt |
| `architect-companion init --project <id>` | Rendert mit projektspezifischem Harness vom Server |
| `architect-companion sync` | Dateien neu rendern lassen, z. B. nach Profil-Update auf dem Server |
| `architect-companion status` | Zeigt Server-URL, Projekt-ID, aktives Profil |

---

## Tech Stack (Zielbild)

```mermaid
graph TB
    subgraph Frontend["Web UI"]
        FE["React / Next.js"]
    end

    subgraph Backend["Server"]
        BE["Node.js · TypeScript\nExpress / Fastify"]
        Core["effective-model.ts + Renderer Services\n(migriert aus bestehendem CLI-Code)"]
    end

    subgraph Storage["Persistenz"]
        DB["PostgreSQL\nProfile · Harness Configs"]
    end

    subgraph LocalCLI["CLI (lokal, npm-Package)"]
        CLI["architect-companion\nHTTP-Client + Datei-Schreiber\n+ modules.yml lesen"]
    end

    FE -->|"REST"| BE
    BE --> Core
    BE --> DB
    CLI -->|"REST /api/render"| BE
```
