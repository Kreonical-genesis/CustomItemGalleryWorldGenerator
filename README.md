# Custom Item Gallery Generator

Static, client-side Minecraft Java Edition 1.21.5 gallery generator.

Open `index.html` from a static host, choose a resource-pack ZIP, select the built-in template or upload a Structure NBT, then download the generated world ZIP. ZIP, NBT, gzip, Anvil region and entity-region handling are implemented in browser JavaScript; no upload or server is used.

The built-in template is intentionally small for smoke tests. Production templates can be exported from a Structure Block with `Include Entities` enabled and uploaded through the template control.

## Local development

No build step is required. Serve this directory with any static HTTP server when browser module restrictions apply, for example `python -m http.server` during development. The generated archive contains `level.dat`, `region/*.mca`, `entities/*.mca` and should be extracted as a world directory under `.minecraft/saves`.

## Contributions

Pull requests are welcome. You can add a new gallery structure without changing the generator code.

A template should be a valid Minecraft Java Edition 1.21.5 Structure NBT with:

- blocks, palette and size;
- entities included in the structure;
- either empty `minecraft:item_frame`/`minecraft:glow_item_frame` slots or `minecraft:armor_stand` slots;
- a design that can repeat indefinitely toward south/north along the Z axis;
- no hardcoded dependency on a single gallery section or fixed item.

Put the NBT in the matching `templates/item_frame/` or `templates/armor_stand/` folder and add its preview GIF to the matching `templates_preview/` folder. Use a descriptive filename, because the site uses the filename for the template card name. If the template is an Armor Stand template, each stand represents one generated item and receives the item in `equipment.mainhand`, `equipment.offhand` and `equipment.head`.

Please include a short description of the slot layout and test the generated world before opening a pull request. Category rules can be extended in `config/item-categories.json`; unmatched items always go to `fallback`.

The GitHub URL in the site header is currently a placeholder and can be replaced when the public repository is ready.
