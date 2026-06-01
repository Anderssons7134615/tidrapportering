# Tidapp Obsidian Bridge

Lokal bridge som körs på Ricks dator och synkar event från Tidapp-backend på Render till Obsidian-valvet.

## Varför den behövs

Render-backend kan inte skriva direkt till `C:/Users/Rick/Documents/Rick Second Brain - Jarvis`, eftersom valvet ligger lokalt på Ricks dator. Backend skapar därför `ObsidianSyncEvent` i databasen. Den här bridgen pollar eventen, hämtar full projekt-snapshot och skriver Markdown lokalt.

## Setup

1. Kopiera `.env.example` till `.env`.
2. Fyll i Render-backendens API-url och ett admin/sync-konto.
3. Kör en gång:

```bash
node obsidian-bridge.mjs --once
```

4. Kör kontinuerligt:

```bash
node obsidian-bridge.mjs
```

## Miljövariabler

- `TIDAPP_API_URL`: Backend-API, t.ex. `https://...onrender.com/api`
- `TIDAPP_EMAIL`: admin/sync-användare i Tidapp
- `TIDAPP_PASSWORD`: lösenord för sync-användaren
- `OBSIDIAN_VAULT_PATH`: lokal sökväg till Obsidian-valvet
- `POLL_INTERVAL_MS`: intervall när scriptet kör kontinuerligt
- `SYNC_EVENT_LIMIT`: max antal events per poll

## Vad scriptet uppdaterar

- Projektanteckningar i `02 Företag - Anderssons Isolering/Projekt`
- Auto-block i projektanteckningen:
  - `tidapp:frontmatter`
  - `tidapp:summary`
  - `tidapp:hours`
  - `tidapp:materials`
  - `tidapp:log`
- Auto-block i `Pågående projekt.md`:
  - `tidapp:project-index`

## Säkerhet

Lägg inte `.env` i Git. Bara `.env.example` ska versioneras.
