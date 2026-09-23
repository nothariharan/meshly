# @nothariharan/meshly

> The operating system for autonomous workers.

Agents reason. Meshly governs execution. Solari provides the environment.

[![Website](https://img.shields.io/badge/website-meshly--six.vercel.app-blue)](https://meshly-six.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Install

```bash
npm install -g @nothariharan/meshly
```

## Quickstart

```bash
meshly init --api-key <your Solari key>
meshly doctor
meshly run
meshly dev
```

`meshly dev` serves the operator console locally at `http://localhost:3400`.

Live Solari is the default. `meshly mcp` does not fall back to the simulator. Pass `--simulator` only for a local demo:

```bash
meshly init --provider simulator --yes
meshly doctor --simulator
npx @nothariharan/meshly mcp --simulator
```

## Why Meshly?

Direct agents execute unverified claims, retry blindly on ambiguous timeouts, and trust model claims over reality. Meshly governs execution:

1. **Reality Verification**: Blocks commits when the observed world state disagrees with the model's claim.
2. **Ambiguous Timeout (UNKNOWN)**: Rents an independent observer to check the world before allowing retries—preventing duplicate charges and duplicate side-effects.
3. **Crash Recovery**: Resumes execution from signed checkpoints without repeating committed work.
4. **Authority & Policies**: Intercepts actions before dispatch and blocks out-of-scope capabilities or budget overruns.

## Controlled Benchmark (100 Trials, simulator)

Same agent, same task, same starting state, local simulator. These numbers are not live Solari results. Regenerate them with `meshly benchmark --suite execution`. A live run is a separate artifact and is labelled `solari`.

| Metric | Direct Agent | Meshly |
| :--- | :---: | :---: |
| **Task success** (normal execution) | 100% | 100% |
| **False commits** (reality divergence) | 100% | **0%** |
| **Duplicate side effects** (timeout & retry) | 5 – 25 | **0** |
| **Recovery without duplicate work** (crash) | 0% | **100%** |
| **Unauthorized actions executed** | 2 | **0** |
| **Budget violations** | 100% | **0%** |

Run the benchmark locally:
```bash
meshly benchmark --suite execution
```

## Links

- **Marketing & Proof**: [https://meshly-six.vercel.app](https://meshly-six.vercel.app)
- **Repository**: [https://github.com/nothariharan/meshly](https://github.com/nothariharan/meshly)
- **Issues**: [https://github.com/nothariharan/meshly/issues](https://github.com/nothariharan/meshly/issues)

## Honesty

- A missing Solari key is an error. Meshly does not quietly run the simulator instead.
- SHA-256 on a run is tamper-evidence for the evidence bundle. It does not prove the world state is true.

## License

MIT

