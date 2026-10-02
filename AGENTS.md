<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Departamento Pessoal (férias, VT, VA, folha, eSocial) vive em src/components/dp/DPWorkspace.tsx + src/lib/dp-calculos.ts, lendo horas/faltas de pnt_daily_summaries/pnt_absences — o ponto é a única fonte de horas da folha.

- Render tracking and NEXTI workplace maps in RastreioMapa.tsx with Leaflet and OpenStreetMap-based tiles; keep location data from existing server functions so map provider changes do not alter business logic.
- Keep the Prospecção Google Maps category tile as a destination-specific visual variant in CategoriaCards; this preserves the shared navigation and permission handling for every tile.
- Keep coordination's local destination menu within the coordination page, separate from the global AppShell navigation; this scopes its five tools to that workspace without changing other areas.
