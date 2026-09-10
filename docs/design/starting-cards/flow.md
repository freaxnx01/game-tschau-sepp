# Flow: choose the number of starting cards

Issue: [#7](https://github.com/freaxnx01/game-tschau-sepp/issues/7)
Phase 2 of the UI workflow. Approved 2026-09-10.
Wireframe: [wireframe.md](wireframe.md)

## Diagram 1 — User journey

```mermaid
flowchart TD
    A[Page load] --> B{localStorage<br/>tschauSeppStartCards}
    B -->|"absent / first visit"| C[startCards = 5<br/>dc prop default]
    B -->|"5 or 7"| D[startCards = stored value]
    B -->|"throws or invalid"| C

    C --> E[Menu: toggle shows 5 selected]
    D --> E2[Menu: toggle shows stored value]

    E --> F[Menu ready]
    E2 --> F

    F -->|clicks 5 or 7| G[setStartCards n]
    G --> H[state + localStorage write<br/>try/catch, failure ignored]
    H --> F

    F -->|Gmüetlich / Gwieft| I[start diff]
    F -->|Mit Kollege| J[MP lobby → host starts]

    I --> K[startRound deals n cards each]
    J --> K
    K --> L[Game in progress —<br/>toggle not reachable, value frozen]
    L -->|Verlaa → menu| F
```

## Diagram 2 — Component and state map

This stack has **no framework and no component library**: one
`Component extends DCLogic` owns everything, with `<sc-if>` / `<sc-for>`
template regions rather than child components. Mapped as it actually is:

```mermaid
flowchart TD
    subgraph TPL["Template — index.html dc block"]
        M["sc-if isMenu<br/>Startmenu"]
        T["sc-for startCardOptions<br/>two buttons"]
        DB["Gmüetlich / Gwieft buttons"]
    end

    subgraph LOGIC["class Component extends DCLogic"]
        ST["state.startCards<br/>SINGLE OWNER"]
        RV["renderVals()<br/>builds startCardOptions"]
        SET["setStartCards n<br/>command, returns nothing"]
        SR["startRound()<br/>reads state.startCards"]
    end

    LS[("localStorage<br/>tschauSeppStartCards")]
    PROP["dc prop startcharte<br/>initial default only"]

    PROP -->|"seeds once, on mount"| ST
    LS -->|"read once, on mount"| ST
    ST --> RV
    RV -->|"props down: label, selected"| T
    T -->|"event up: click"| SET
    SET --> ST
    SET -->|"write, try/catch"| LS
    DB --> SR
    ST --> SR
```

**Ownership:** `state.startCards` is the single source of truth. `localStorage`
is a mirror for the next visit, never read during play; the dc prop seeds only
the first load. This keeps the stack rule that a render function reads state and
never mutates it, and that input handlers write state and never draw.

**No services, no API calls, no async.** Nothing to inject, nothing to fail over.

## Screen inventory

No new screens or dialogs. Two implied gaps, surfaced rather than skipped:

- **The MP lobby shows no card count.** Placement is start-menu-only, so a guest
  joining a host's game cannot see how many cards they will be dealt until the
  round begins. Not a blocker — it is obvious once dealt — but it is a real
  information gap created by that decision. Revisit if guests ask.
- **`startRound()` is also called on "Nöchsti Rundä"**, not only from the menu.
  The count must stay frozen for a whole match. Nothing can change
  `state.startCards` while `phase !== 'menu'`, so this holds by construction —
  but it gets an explicit test rather than being trusted.
