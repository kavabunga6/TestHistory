# Third-Party Notices

TestHistory is distributed under the Apache License 2.0. It also incorporates third-party
components under their own licenses.

The web application directly incorporates:

| Component                     | License                   | Purpose                |
| ----------------------------- | ------------------------- | ---------------------- |
| Inter via `@fontsource/inter` | SIL Open Font License 1.1 | User-interface font    |
| Lucide                        | ISC                       | User-interface icons   |
| React and React DOM           | MIT                       | User-interface runtime |

The complete machine-generated license bundle for the web artifact is written to
`apps/web/dist/licenses/THIRD_PARTY_LICENSES.txt` during every production build. The same directory
also contains TestHistory's `LICENSE` and `NOTICE` files. The web container serves these files from
`/licenses/`.

Other application images retain installed production packages and their accompanying license files
inside `node_modules`. The repository license guard validates every dependency recorded in
`package-lock.json` against the approved SPDX allowlist. Adding a new license to that allowlist
requires an explicit review of its redistribution and compatibility terms.

This notice is informational and does not replace or modify any third-party license.
