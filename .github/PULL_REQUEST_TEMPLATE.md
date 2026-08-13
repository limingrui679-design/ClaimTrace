## Summary

Describe the problem and the behavior or documentation changed.

## Evidence

List the tests, generated artifacts, screenshots, or source records that verify the change.

## Boundary review

- [ ] I kept prototype, deployment, authentication, adoption, and impact claims distinct.
- [ ] I kept public-source observations separate from manual or synthetic decision inputs.
- [ ] I did not add sensitive or credential-bearing data.

## Verification

- [ ] `npm run test:docs`
- [ ] `npm run ci`
- [ ] `npm audit --omit=dev`
- [ ] `npm audit`
- [ ] `git diff --check`
- [ ] Generated artifacts and documentation were updated when required.
