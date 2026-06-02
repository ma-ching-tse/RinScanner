// Resolve BMDS color tokens to actual Figma Variables so fixes can BIND
// (not just snap a raw value). Binding is what makes MCP/Dev Mode emit a
// token name (var(--brand)) instead of a hardcoded hex.
//
// A Figma color variable's `name` for a grouped variable is the slash path,
// e.g. "Function/CEX/Brand" — which matches our BMDS `${group}/${name}`.

/** All color-variable names available to this file (local + subscribed library). */
export async function getAvailableColorVariableNames(): Promise<Set<string>> {
  const names = new Set<string>();

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of collections) {
    for (const id of c.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v && v.resolvedType === 'COLOR') names.add(v.name);
    }
  }

  try {
    const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const lc of libCols) {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lc.key);
      for (const v of vars) {
        if (v.resolvedType === 'COLOR') names.add(v.name);
      }
    }
  } catch {
    // teamLibrary may be unavailable (e.g. headless) — local-only is fine.
  }

  return names;
}

/** Find (and import, if from a library) the color Variable with the given slash-path name. */
export async function findColorVariableByName(name: string): Promise<Variable | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of collections) {
    for (const id of c.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v && v.resolvedType === 'COLOR' && v.name === name) return v;
    }
  }

  try {
    const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const lc of libCols) {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lc.key);
      const match = vars.find((v) => v.resolvedType === 'COLOR' && v.name === name);
      if (match) return await figma.variables.importVariableByKeyAsync(match.key);
    }
  } catch {
    // ignore
  }

  return null;
}
