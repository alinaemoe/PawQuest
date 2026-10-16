import fs from 'node:fs';

const edit = (p, f) => {
  const s = fs.readFileSync(p, 'utf8');
  const r = f(s);
  if (r === s) throw new Error('no change ' + p);
  fs.writeFileSync(p, r);
};
const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  return s.replace(a, b);
};

edit('packages/data/src/quickMarks.ts', (s) =>
  s +
  `
/** The "Undo" of removing a custom mark: it comes back to the catalog (not to the panel). */
export function restoreCustomMark(db: SqlDb, ctx: Ctx, id: string): boolean {
  return (
    db.run(
      'UPDATE event_type SET archived = 0, updated_at = ? WHERE id = ? AND builtin = 0 AND archived = 1',
      [toIso(ctx.now()), id],
    ).changes > 0
  );
}
`,
);
edit('packages/data/src/index.ts', (s) => must(s, '  resetPanel,\n  setPanelOrder,', '  resetPanel,\n  restoreCustomMark,\n  setPanelOrder,'));
edit('packages/data/src/quickMarks.test.ts', (s) =>
  must(
    s,
    "  it('cannot remove a built-in mark, a missing one, or the same mark twice', () => {",
    `  it('a removed mark can be brought back, to the catalog', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex', onPanel: true });
    archiveCustomMark(env.db, env.ctx, mark.id);
    expect(restoreCustomMark(env.db, env.ctx, mark.id)).toBe(true);
    const back = listEventTypes(env.db).find((t) => t.id === mark.id);
    expect(back?.slot).toBeNull();
    expect(restoreCustomMark(env.db, env.ctx, mark.id)).toBe(false); // not removed any more
    expect(restoreCustomMark(env.db, env.ctx, 'dog')).toBe(false); // built-in
  });

  it('cannot remove a built-in mark, a missing one, or the same mark twice', () => {`,
  ).replace("  resetPanel,\n  setPanelOrder,", "  resetPanel,\n  restoreCustomMark,\n  setPanelOrder,"),
);

const add = {
  ru: { 'marks.deleted': 'Метка удалена, события остались' },
  en: { 'marks.deleted': 'Mark removed, the events stay' },
};
for (const lang of ['ru', 'en']) {
  const p = `packages/i18n/src/dictionaries/${lang}.ts`;
  const block = Object.entries(add[lang]).map(([k, v]) => `  '${k}': '${v}',`).join('\n');
  edit(p, (s) => s.replace(/\n\} as const satisfies/, `\n\n${block}\n} as const satisfies`));
}

// Root overlay and the Dog tab row
edit('apps/mobile/src/app/Root.tsx', (s) => {
  let r = must(s, "{ kind: 'trash' } | { kind: 'health' } | { kind: 'places' }", "{ kind: 'trash' } | { kind: 'health' } | { kind: 'places' } | { kind: 'marks' }");
  r = must(
    r,
    "  if (overlay?.kind === 'places') {",
    `  if (overlay?.kind === 'marks') {
    return (
      <>
        {statusBar}
        <QuickMarksContainer
          onBack={() => {
            setOverlay(null);
          }}
        />
      </>
    );
  }

  if (overlay?.kind === 'places') {`,
  );
  r = must(
    r,
    `            onPlaces={() => {
              setOverlay({ kind: 'places' });
            }}`,
    `            onPlaces={() => {
              setOverlay({ kind: 'places' });
            }}
            onMarks={() => {
              setOverlay({ kind: 'marks' });
            }}`,
  );
  r = must(r, "import { PlacesContainer } from './PlacesContainer';", "import { PlacesContainer } from './PlacesContainer';\nimport { QuickMarksContainer } from './QuickMarksContainer';");
  return r;
});
edit('packages/screens/src/DogScreen.tsx', (s) => {
  let r = must(s, '  readonly onPlaces: () => void;', '  readonly onPlaces: () => void;\n  readonly onMarks: () => void;');
  r = must(
    r,
    `        <ListRow
          icon="note"
          title={i18n.t('dog.diary')}`,
    `        <ListRow
          icon="paw"
          title={i18n.t('dog.marks')}
          subtitle={i18n.t('dog.marksHint')}
          onPress={props.onMarks}
        />
        <ListRow
          icon="note"
          title={i18n.t('dog.diary')}`,
  );
  return r;
});

// the walk screen uses the same look helper
edit('apps/mobile/src/app/WalkContainer.tsx', (s) => {
  let r = must(s, "import { NewPlaceFlow } from './NewPlaceFlow';", "import { NewPlaceFlow } from './NewPlaceFlow';\nimport { markLook } from './QuickMarksContainer';");
  return r;
});
