// Calls that go UP the load order. A file may import from files with a lower number (they have run already). When it
// needs something from a higher-numbered file (a render call from the imagery code, say) it goes through `wire.name`:
// the file that owns the name registers a getter here when it loads. Every use is inside a function that runs after
// the page has loaded, so the name is always there by then. This keeps the import graph free of cycles, so the files
// load in the order of their numbers, with no surprises.
export const wire = /** @type {any} */ ({});
