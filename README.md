# Custom Item Gallery Generator

Static, client-side Minecraft Java Edition 1.21.5 gallery generator.

Open `index.html` from a static host, choose a resource-pack ZIP, select the built-in template or upload a Structure NBT, then download the generated world ZIP. ZIP, NBT, gzip, Anvil region and entity-region handling are implemented in browser JavaScript; no upload or server is used.

The built-in template is intentionally small for smoke tests. Production templates can be exported from a Structure Block with `Include Entities` enabled and uploaded through the template control.

## Local development

No build step is required. Serve this directory with any static HTTP server when browser module restrictions apply, for example `python -m http.server` during development. The generated archive contains `level.dat`, `region/*.mca`, `entities/*.mca` and should be extracted as a world directory under `.minecraft/saves`.
