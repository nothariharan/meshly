# External user test

This is the v0.1.1 release gate. It has not been run yet.

The facilitator says **only** this sentence:

> Install Meshly and run the reconciliation worker.

Do not explain architecture.
Do not mention `meshly init --provider`.
Do not mention where the console lives.
Do not explain Worker / Run / Environment.

Until `meshly` is on the npm registry, hand them the tarballs from `npm run pack:local` and the install line in `dist/npm/INSTALL.txt`. Do not narrate what those packages are.

Watch. Do not help unless they are completely blocked.

## Record

```text
EXTERNAL USER TEST #1

Date:
Participant:   (never seen the source)
Machine:       (OS, Node version, Solari key already present? Y/N)

T1 — Installation
time:
what they typed:
hesitation:

T2 — Initialization
time:
what they typed:
hesitation:

T3 — Worker creation
time:
what they typed:
hesitation:

T4 — First run
time to first worker:
time to first successful run:
hesitation:

T5 — Console discovery
did they find `meshly dev`?
what they expected the console to do:

T6 — Failure interpretation
showed them a BLOCKED or UNKNOWN run? how:
what they thought it meant:

Blockers:
...

Confusion:
...

Fixes:
...
```

## After the first test

Fix only the blockers and the wording that caused hesitation.

Run **EXTERNAL USER TEST #2** with a different person.

Do not publish to npm until test #2 completes without a facilitator rescue.
