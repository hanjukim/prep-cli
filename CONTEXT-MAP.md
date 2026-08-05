# Context map

Two glossaries, because two programs live here. Read the one your work is in.

| Context | Glossary | The code it describes |
|---|---|---|
| **prep** | `CONTEXT.md` | `src/` — the CLI, its subcommands, the registry and the files a run writes |
| **the bootstrap script** | `scripts/CONTEXT.md` | `scripts/bootstrap.sh` — the one-liner that builds the machine prep runs on |

The split follows a boundary that was already there. The script sits outside
prep (docs/adr/0009) and shares no code with it, and the coupling runs one way:
the script's glossary names prep's terms constantly, while prep's names the
script once. So an agent working in `src/` reads nothing about a shell script,
and an agent working on the script reads both — its own file first, and the root
glossary for the terms it borrows.

Design records stay in one place. `docs/adr/` holds every decision, both
programs' alike, and is read by area rather than whole: the numbering is one
sequence, the records cite each other across the boundary constantly, and a
record that moved would leave every citation of it wrong. Nothing about reading
them selectively changes here.
