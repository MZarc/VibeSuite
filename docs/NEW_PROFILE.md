# Authoring a new stack profile

Profiles live in `src/profiles/profiles.ts` as data (never scattered conditionals).

1. Add an entry: `{id, name, stacks[], characteristics[], artifacts[] (subset of ARTIFACTS), requiredChecks[] ("security-requirements" | "error-handling"), testCategories[], constraints[], conventions[], unsupported[], version}`.
2. Keep `artifacts` honest: list only docs the compiler actually renders for that stack (renderer filters by profile).
3. `requiredChecks` map to validator rules (`profile-rules`): only use implemented check keys; document anything advisory in `constraints`, not as a fake enforcement.
4. Add a unit test in `tests/unit/core.test.ts` asserting the artifact subset + a validator expectation.
5. Document user-visible behavior in `docs/` + `CHANGELOG.md`. Bump the profile `version`.

Selection is never automatic from a mere mention: prefer `prd_inspect_workspace` evidence + `user_confirmed` `set-export-config.profile`.
