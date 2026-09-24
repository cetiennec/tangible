# Lesson production instructions

These instructions apply to lesson briefs, scenes, narration, assistant context,
review, and deployment.

## Roles and source of truth

- The human owns the spoken narration, natural-language scene intent, and final
  pedagogical and aesthetic judgment.
- The agent owns scene implementation, formal choreography, technical validation,
  and deployment execution when explicitly requested.
- Do not rewrite human narration unless the user asks. Report a scene hint that
  cannot be implemented faithfully instead of silently changing its meaning.

For a new lesson or a substantial lesson-production task, use the repo-local
`create-tangible-lesson` skill in `.agents/skills/` and follow
`DOCUMENTATION.md`.

When a new lesson starts from an idea rather than existing files, establish the
subject and the relationship that should become visible. Do not require a formal
brief when the author has already provided those two pieces of intent.

## Production sequence

1. Implement the smallest scene that expresses the author's intended relationship.
2. Ask the human to test the scene before formal choreography.
3. Preserve narration prose and translate `[[natural-language hint]]` into
   schema-valid directives.
4. Iterate offline, then tune against real narration.
5. Deploy only when the user has requested deployment and the private build has
   passed the release checklist.

## Scene rules

- Keep parameters conceptual, few, and discoverable through `lesson ref`.
- Render from current state; do not accumulate authored state frame by frame.
- Use `script`, `shared`, and `viewer` ownership deliberately.
- Keep schema exports free of DOM initialization.
- Prefer lesson-local code until a second lesson proves an ingredient reusable.
- Test the model or computation when scientific correctness is non-trivial.

## Narration rules

- Give every number and symbol a spoken form: `two DOF`, `q one`,
  `L one equals L two`. A synthesizer reads the script as written.
- Never rewrite text inside a directive to change pronunciation. Directive
  bodies are displayed, not spoken, so the edit corrupts the board and changes
  no audio. A search and replace over `script.md` must skip them by scanning
  `@name(` to its balanced closing parenthesis.
- Captions come from the same text, so a phonetic spelling is visible to the
  learner. Weigh that per term.
- A `@pause` prompt is narrated unless it carries `speak: false`; any value other
  than `true` or `false` fails the build.
- For providers without word alignment, a cue anchored at a clause break gets an
  exact time; one placed mid-phrase is interpolated.
- Listen to the built audio before deploying. A build succeeds whether or not
  the voice made sense.

See [the synthesizer section](../DOCUMENTATION.md#write-for-the-synthesizer) for
the reasoning behind each rule.

## Validation loop

Before narration exists, validate the scene contract and let the human manipulate
the scene independently:

```bash
pnpm lesson ref --lesson lessons/<id>
pnpm lesson scene --lesson lessons/<id>
```

After narration exists, use the complete lesson loop:

```bash
pnpm lesson ref --lesson lessons/<id>
pnpm lesson check --lesson lessons/<id>
pnpm lesson build --offline --bundle --lesson lessons/<id>
pnpm lesson preview --offline --lesson lessons/<id>
```

Inspect representative states and frames, then test live interaction, resizing,
pause/resume, seeking, and touch where relevant. Real provider calls and external
deployment require explicit user intent.

Generated `build/` and `.cache/` files are not authored source and must not be
committed.
